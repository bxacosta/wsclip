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
                message = MessageFactory.CreateImageData(content.ImageData!, content.ImageWidth, content.ImageHeight);
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
        _logger.Info("SYNC", $"Sent {content.Type}: {SizeFormatter.Format(content.Size)}");
    }
    
    private async void OnMessageReceived(object? sender, MessageReceivedEventArgs e)
    {
        if (e.Message is not DataMessage data)
        {
            return;
        }
        
        try
        {
            await ApplyReceivedContent(data);
        }
        catch (Exception ex)
        {
            _logger.Warn("SYNC", $"Error applying received content: {ex.Message}");
        }
    }
    
    private async Task ApplyReceivedContent(DataMessage data)
    {
        var payload = data.Payload;
        var decodedData = Convert.FromBase64String(payload.Data);
        
        // Validate received content size against maxContentSize
        if (decodedData.Length > _config.MaxContentSize)
        {
            _logger.Warn("SYNC", $"Received content too large: {SizeFormatter.Format(decodedData.Length)} > {SizeFormatter.Format(_config.MaxContentSize)} (max), ignoring");
            return;
        }
        
        _logger.Info("SYNC", $"Received {payload.ContentType}: {SizeFormatter.Format(decodedData.Length)}");
        
        // Mark as applied before writing to clipboard
        var textContent = payload.ContentType == ContentType.Text ? payload.Data : null;
        _contentTracker.MarkAsApplied(decodedData, textContent);
        
        switch (payload.ContentType)
        {
            case ContentType.Text:
                var text = System.Text.Encoding.UTF8.GetString(decodedData);
                ClipboardWriter.WriteText(text);
                _logger.Info("SYNC", $"Applied text ({text.Length} chars)");
                break;
                
            case ContentType.Binary:
                // Check if it's a file or image based on metadata
                if (payload.Metadata?.Filename is not null)
                {
                    // It's a file
                    var paths = _tempFileManager.SaveFiles([(payload.Metadata.Filename, decodedData)]);
                    if (paths.Length > 0)
                    {
                        ClipboardWriter.WriteFile(paths[0]);
                        _logger.Info("SYNC", $"Applied file: {payload.Metadata.Filename}");
                    }
                }
                else
                {
                    // It's an image
                    ClipboardWriter.WriteImage(decodedData);
                    _logger.Info("SYNC", "Applied image");
                }
                break;
        }
        
        // Send ACK
        var ack = MessageFactory.CreateAck(data.Header.Id, AckStatus.Success);
        await _wsClient.SendAsync(ack);
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

