using WSClip.Clipboard;
using WSClip.Config;
using WSClip.Network;
using WSClip.Protocol;
using WSClip.Utils;

namespace WSClip.Sync;

/// <summary>
/// Main synchronization service orchestrating clipboard and network
/// </summary>
public sealed class SyncService : IAsyncDisposable
{
    private readonly Logger _logger = Logger.Instance;
    private readonly AppConfig _config;
    private readonly WebSocketClient _wsClient;
    private readonly ClipboardMonitor _clipboardMonitor;
    private readonly ContentTracker _contentTracker = new();
    private readonly TempFileManager _tempFileManager = new();
    
    private bool _disposed;
    private bool _syncActive;
    private CancellationTokenSource? _cts;
    
    public SyncService(AppConfig config)
    {
        _config = config;
        _wsClient = new WebSocketClient(config);
        _clipboardMonitor = new ClipboardMonitor();
        
        // Wire up events
        _wsClient.StateChanged += OnWebSocketStateChanged;
        _wsClient.MessageReceived += OnMessageReceived;
        _wsClient.PartnerChanged += OnPartnerChanged;
        _clipboardMonitor.ClipboardChanged += OnClipboardChanged;
    }
    
    /// <summary>
    /// Starts the sync service
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        _logger.Info("SYNC", "Starting synchronization service");
        _logger.Info("SYNC", $"Session: {_config.SessionId}");
        _logger.Info("SYNC", $"Server: {_config.ServerUrl}");
        
        if (_config.Proxy is { Enabled: true })
        {
            _logger.Info("SYNC", $"Proxy: {_config.Proxy.Host}:{_config.Proxy.Port}");
        }
        
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        
        // Start clipboard monitoring
        _clipboardMonitor.Start();
        
        // Start WebSocket connection
        await _wsClient.ConnectAsync(_cts.Token);
    }
    
    /// <summary>
    /// Runs the service until cancellation (keeps alive)
    /// </summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        // Just wait for cancellation - the WebSocket handles its own receive loop
        try
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown
        }
    }
    
    /// <summary>
    /// Stops the sync service
    /// </summary>
    public async Task StopAsync()
    {
        _logger.Info("SYNC", "Stopping synchronization service");
        
        _clipboardMonitor.Stop();
        await _wsClient.CloseAsync();
        _tempFileManager.Cleanup();
    }
    
    private void OnWebSocketStateChanged(object? sender, StateChangedEventArgs e)
    {
        _syncActive = e.NewState == AppState.SyncActive;
        
        if (!_syncActive)
        {
            _contentTracker.Clear();
        }
    }
    
    private void OnPartnerChanged(object? sender, PartnerChangedEventArgs e)
    {
        if (e.Connected)
        {
            _logger.Info("SYNC", $"Partner connected: {e.ConnectionId}");
        }
        else
        {
            _logger.Info("SYNC", "Partner disconnected");
            _contentTracker.Clear();
        }
    }
    
    private async void OnClipboardChanged(object? sender, ClipboardChangedEventArgs e)
    {
        if (!_syncActive)
        {
            _logger.Debug("SYNC", "Clipboard changed but sync not active");
            return;
        }
        
        try
        {
            await SendClipboardContent(e.Content);
        }
        catch (Exception ex)
        {
            _logger.Warn("SYNC", $"Error sending clipboard: {ex.Message}");
        }
    }
    
    private async Task SendClipboardContent(ClipboardContent content)
    {
        // Check if this is content we just applied
        if (!_contentTracker.ShouldSendContent(content.ImageData ?? content.FileData, content.Text))
        {
            return;
        }
        
        // Validate content size against maxContentSize
        if (content.Size > _config.MaxContentSize)
        {
            _logger.Warn("SYNC", $"Content too large: {SizeFormatter.Format(content.Size)} > {SizeFormatter.Format(_config.MaxContentSize)} (max)");
            return;
        }
        
        _logger.Debug("SYNC", $"Sending {content.Type} content");
        
        DataMessage message;
        
        switch (content.Type)
        {
            case ClipboardContentType.Text:
                message = MessageFactory.CreateTextData(content.Text!);
                break;
                
            case ClipboardContentType.Image:
                message = MessageFactory.CreateImageData(content.ImageData!);
                break;
                
            case ClipboardContentType.File:
                if (content.FileData is null || string.IsNullOrEmpty(content.FileName))
                    return;
                message = MessageFactory.CreateFileData(content.FileData, content.FileName, content.MimeType ?? "application/octet-stream");
                break;
                
            default:
                return;
        }
        
        await _wsClient.SendAsync(message);
        
        // Mark as sent to prevent duplicate sends
        _contentTracker.MarkAsSent(content.ImageData ?? content.FileData, content.Text);
        
        var shortId = MessageFactory.GetShortId(message.Header.Id);
        var logMessage = content.Type switch
        {
            ClipboardContentType.File => $"Sent: file \"{content.FileName}\" ({SizeFormatter.Format(content.Size)}) [{shortId}]",
            _ => $"Sent: {content.Type.ToString().ToLower()} ({SizeFormatter.Format(content.Size)}) [{shortId}]"
        };
        _logger.Info("SYNC", logMessage);
    }
    
    private async void OnMessageReceived(object? sender, MessageReceivedEventArgs e)
    {
        try
        {
            switch (e.Message)
            {
                case DataMessage data:
                    await ApplyReceivedContent(data);
                    break;
                    
                case AckMessage ack:
                    var shortId = MessageFactory.GetShortId(ack.Payload.MessageId);
                    _logger.Info("SYNC", $"Received ACK [{shortId}]");
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.Warn("SYNC", $"Error processing message: {ex.Message}");
        }
    }
    
    private async Task ApplyReceivedContent(DataMessage data)
    {
        var payload = data.Payload;
        var shortId = MessageFactory.GetShortId(data.Header.Id);
        
        // Handle TEXT (raw UTF-8) vs BINARY (base64 encoded)
        if (payload.ContentType == ContentType.Text)
        {
            var text = payload.Data; // TEXT is raw UTF-8, not base64
            var textBytes = System.Text.Encoding.UTF8.GetBytes(text);
            
            // Validate size
            if (textBytes.Length > _config.MaxContentSize)
            {
                _logger.Warn("SYNC", $"Received content too large: {SizeFormatter.Format(textBytes.Length)} > {SizeFormatter.Format(_config.MaxContentSize)} (max), ignoring");
                return;
            }
            
            _logger.Info("SYNC", $"Received: text ({SizeFormatter.Format(textBytes.Length)}) [{shortId}]");
            
            // Mark as applied before writing to clipboard
            _contentTracker.MarkAsApplied(null, text);
            
            ClipboardWriter.WriteText(text);
        }
        else // ContentType.Binary
        {
            var decodedData = Convert.FromBase64String(payload.Data);
            
            // Validate size
            if (decodedData.Length > _config.MaxContentSize)
            {
                _logger.Warn("SYNC", $"Received content too large: {SizeFormatter.Format(decodedData.Length)} > {SizeFormatter.Format(_config.MaxContentSize)} (max), ignoring");
                return;
            }
            
            // Mark as applied before writing to clipboard
            _contentTracker.MarkAsApplied(decodedData, null);
            
            // Check if it's a file or image based on metadata
            if (payload.Metadata?.Filename is not null)
            {
                // It's a file
                _logger.Info("SYNC", $"Received: file \"{payload.Metadata.Filename}\" ({SizeFormatter.Format(decodedData.Length)}) [{shortId}]");
                
                var paths = _tempFileManager.SaveFiles([(payload.Metadata.Filename, decodedData)]);
                if (paths.Length > 0)
                {
                    ClipboardWriter.WriteFile(paths[0]);
                }
            }
            else
            {
                // It's an image
                _logger.Info("SYNC", $"Received: image ({SizeFormatter.Format(decodedData.Length)}) [{shortId}]");
                ClipboardWriter.WriteImage(decodedData);
            }
        }
        
        // Send ACK
        var ack = MessageFactory.CreateAck(data.Header.Id, AckStatus.Success);
        await _wsClient.SendAsync(ack);
        _logger.Info("SYNC", $"Sent ACK [{shortId}]");
    }
    
    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        
        _clipboardMonitor.Dispose();
        await _wsClient.DisposeAsync();
        _tempFileManager.Dispose();
        _cts?.Dispose();
    }
}

