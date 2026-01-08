using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using WSClip.Config;
using WSClip.Protocol;
using WSClip.Utils;

namespace WSClip.Network;

/// <summary>
/// Application connection state
/// </summary>
public enum AppState
{
    Disconnected,
    Connecting,
    WaitingForPartner,
    SyncActive,
    Reconnecting
}

/// <summary>
/// Event args for state changes
/// </summary>
public sealed class StateChangedEventArgs(AppState oldState, AppState newState) : EventArgs
{
    public AppState OldState { get; } = oldState;
    public AppState NewState { get; } = newState;
}

/// <summary>
/// Event args for received messages
/// </summary>
public sealed class MessageReceivedEventArgs(Message message) : EventArgs
{
    public Message Message { get; } = message;
}

/// <summary>
/// Event args for partner connection changes
/// </summary>
public sealed class PartnerChangedEventArgs(string connectionId, bool connected) : EventArgs
{
    public string ConnectionId { get; } = connectionId;
    public bool Connected { get; } = connected;
}

/// <summary>
/// WebSocket client with auto-reconnection and proxy support
/// </summary>
public sealed class WebSocketClient : IAsyncDisposable
{
    private readonly AppConfig _config;
    private readonly Logger _logger = Logger.Instance;
    private readonly BackoffCalculator _backoff = new();
    private readonly Lock _stateLock = new();
    
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cts;
    private Task? _receiveTask;
    private Socket? _proxySocket;
    
    private AppState _state = AppState.Disconnected;
    private string? _partnerId;
    
    public AppState State
    {
        get { lock (_stateLock) return _state; }
        private set
        {
            AppState oldState;
            lock (_stateLock)
            {
                if (_state == value) return;
                oldState = _state;
                _state = value;
            }
            StateChanged?.Invoke(this, new StateChangedEventArgs(oldState, value));
        }
    }
    
    public string? PartnerId => _partnerId;
    public bool IsConnected => State is AppState.WaitingForPartner or AppState.SyncActive;
    public bool CanSync => State == AppState.SyncActive;
    
    public event EventHandler<StateChangedEventArgs>? StateChanged;
    public event EventHandler<MessageReceivedEventArgs>? MessageReceived;
    public event EventHandler<PartnerChangedEventArgs>? PartnerChanged;
    
    public WebSocketClient(AppConfig config)
    {
        _config = config;
    }
    
    /// <summary>
    /// Connects to the WebSocket server
    /// </summary>
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        State = AppState.Connecting;
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        
        while (!_cts.Token.IsCancellationRequested)
        {
            try
            {
                await ConnectInternalAsync(_cts.Token);
                _backoff.Reset();
                
                // Start receive loop
                _receiveTask = ReceiveLoopAsync(_cts.Token);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (IsFatalError(ex))
                {
                    _logger.Error("WS", $"Fatal error: {ex.Message}");
                    State = AppState.Disconnected;
                    throw;
                }
                
                State = AppState.Reconnecting;
                var delay = _backoff.NextDelay();
                _logger.Warn("WS", $"Connection failed. Reconnecting in {delay / 1000}s... (attempt {_backoff.CurrentAttempt})");
                
                try
                {
                    await Task.Delay(delay, _cts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                
                State = AppState.Connecting;
            }
        }
    }
    
    private async Task ConnectInternalAsync(CancellationToken cancellationToken)
    {
        _webSocket?.Dispose();
        _proxySocket?.Dispose();
        
        _webSocket = new ClientWebSocket();
        
        // Build WebSocket URL with query params
        var wsUrl = $"{_config.WebSocketUrl}/ws?sessionId={_config.SessionId}&connectionId={_config.ConnectionId}&secret={_config.Secret}";
        var uri = new Uri(wsUrl);
        
        if (_config.Proxy is { Enabled: true })
        {
            _logger.Debug("WS", $"Connecting via SOCKS5 proxy {_config.Proxy.Host}:{_config.Proxy.Port}");
            
            var connector = new Socks5Connector(_config.Proxy);
            var targetPort = uri.Port > 0 ? uri.Port : (uri.Scheme == "wss" ? 443 : 80);
            _proxySocket = await connector.ConnectAsync(uri.Host, targetPort, cancellationToken);
            
            var handler = new SocketsHttpHandler
            {
                ConnectCallback = async (_, _) => new NetworkStream(_proxySocket, ownsSocket: false)
            };
            
            await _webSocket.ConnectAsync(uri, new HttpMessageInvoker(handler), cancellationToken);
        }
        else
        {
            await _webSocket.ConnectAsync(uri, cancellationToken);
        }
        
        _logger.Info("WS", "Connected to server");
    }
    
    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024]; // 64KB buffer
        var messageBuffer = new MemoryStream();
        
        try
        {
            while (_webSocket?.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                var result = await _webSocket.ReceiveAsync(buffer, cancellationToken);
                
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.Info("WS", "Server closed connection");
                    break;
                }
                
                messageBuffer.Write(buffer, 0, result.Count);
                
                if (result.EndOfMessage)
                {
                    var json = Encoding.UTF8.GetString(messageBuffer.ToArray());
                    messageBuffer.SetLength(0);
                    
                    ProcessMessage(json);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (WebSocketException ex)
        {
            _logger.Debug("WS", $"WebSocket error: {ex.Message}");
        }
        catch (Exception ex)
        {
            _logger.Error("WS", $"Receive error: {ex.Message}");
        }
        
        // Trigger reconnection if not intentionally closed
        if (!cancellationToken.IsCancellationRequested && State != AppState.Disconnected)
        {
            _partnerId = null;
            _ = ReconnectAsync();
        }
    }
    
    private void ProcessMessage(string json)
    {
        try
        {
            var message = MessageFactory.Deserialize(json);
            if (message is null)
            {
                _logger.Warn("WS", "Received invalid message");
                return;
            }
            
            _logger.Debug("WS", $"Received: {message.Header.Type}");
            
            switch (message)
            {
                case ReadyMessage ready:
                    HandleReady(ready);
                    break;
                    
                case ConnectionMessage conn:
                    HandleConnection(conn);
                    break;
                    
                case ErrorMessage error:
                    HandleError(error);
                    break;
                    
                default:
                    // DATA, ACK, CONTROL - forward to sync service
                    MessageReceived?.Invoke(this, new MessageReceivedEventArgs(message));
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.Error("WS", $"Error processing message: {ex.Message}");
        }
    }
    
    private void HandleReady(ReadyMessage ready)
    {
        _logger.Info("WS", $"Connected as {ready.Payload.ConnectionId} to session {ready.Payload.SessionId}");
        
        if (ready.Payload.OtherConnections.Length > 0)
        {
            _partnerId = ready.Payload.OtherConnections[0].Id;
            _logger.Info("WS", $"Partner connected: {_partnerId}");
            State = AppState.SyncActive;
            PartnerChanged?.Invoke(this, new PartnerChangedEventArgs(_partnerId, true));
        }
        else
        {
            _logger.Info("WS", "Waiting for partner device...");
            State = AppState.WaitingForPartner;
        }
    }
    
    private void HandleConnection(ConnectionMessage conn)
    {
        if (conn.Payload.Status == ConnectionStatus.Connected)
        {
            _partnerId = conn.Payload.ConnectionId;
            _logger.Info("WS", $"Partner connected: {_partnerId}");
            State = AppState.SyncActive;
            PartnerChanged?.Invoke(this, new PartnerChangedEventArgs(_partnerId, true));
        }
        else
        {
            var disconnectedId = conn.Payload.ConnectionId;
            _logger.Info("WS", $"Partner disconnected: {disconnectedId}");
            
            if (_partnerId == disconnectedId)
            {
                _partnerId = null;
                State = AppState.WaitingForPartner;
                PartnerChanged?.Invoke(this, new PartnerChangedEventArgs(disconnectedId, false));
            }
        }
    }
    
    private void HandleError(ErrorMessage error)
    {
        _logger.Error("WS", $"{error.Payload.Code}: {error.Payload.Message}");
        
        // Check for fatal errors
        if (error.Payload.Code is "INVALID_SECRET" or "SESSION_FULL" or "DUPLICATE_CONNECTION_ID")
        {
            throw new WebSocketException($"Fatal error: {error.Payload.Code}");
        }
    }
    
    private async Task ReconnectAsync()
    {
        State = AppState.Reconnecting;
        var delay = _backoff.NextDelay();
        _logger.Warn("WS", $"Connection lost. Reconnecting in {delay / 1000}s... (attempt {_backoff.CurrentAttempt})");
        
        try
        {
            await Task.Delay(delay, _cts?.Token ?? CancellationToken.None);
            await ConnectAsync(_cts?.Token ?? CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            // Shutdown requested
        }
        catch (Exception ex)
        {
            _logger.Error("WS", $"Reconnection failed: {ex.Message}");
        }
    }
    
    /// <summary>
    /// Sends a message through the WebSocket
    /// </summary>
    public async Task SendAsync<T>(T message, CancellationToken cancellationToken = default) where T : Message
    {
        if (_webSocket?.State != WebSocketState.Open)
        {
            _logger.Warn("WS", "Cannot send: not connected");
            return;
        }
        
        var json = MessageFactory.Serialize(message);
        var bytes = Encoding.UTF8.GetBytes(json);
        
        await _webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
        _logger.Debug("WS", $"Sent: {message.Header.Type}");
    }
    
    /// <summary>
    /// Closes the connection gracefully
    /// </summary>
    public async Task CloseAsync()
    {
        _cts?.Cancel();
        
        if (_webSocket?.State == WebSocketState.Open)
        {
            try
            {
                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closing", CancellationToken.None);
            }
            catch
            {
                // Ignore close errors
            }
        }
        
        if (_receiveTask is not null)
        {
            try
            {
                await _receiveTask;
            }
            catch
            {
                // Ignore task errors
            }
        }
        
        State = AppState.Disconnected;
    }
    
    private static bool IsFatalError(Exception ex)
    {
        // Check for authentication or session errors
        return ex.Message.Contains("401") || 
               ex.Message.Contains("403") ||
               ex.Message.Contains("INVALID_SECRET") ||
               ex.Message.Contains("SESSION_FULL") ||
               ex.Message.Contains("DUPLICATE_CONNECTION_ID");
    }
    
    public async ValueTask DisposeAsync()
    {
        await CloseAsync();
        _webSocket?.Dispose();
        _proxySocket?.Dispose();
        _cts?.Dispose();
    }
}
