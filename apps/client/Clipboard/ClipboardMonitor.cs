using System.Runtime.InteropServices;
using WSClip.Utils;

namespace WSClip.Clipboard;

/// <summary>
/// Event args for clipboard changes
/// </summary>
public sealed class ClipboardChangedEventArgs(ClipboardContent content) : EventArgs
{
    public ClipboardContent Content { get; } = content;
}

/// <summary>
/// Monitors Windows clipboard for changes using native events
/// </summary>
public sealed class ClipboardMonitor : IDisposable
{
    private readonly Logger _logger = Logger.Instance;
    private readonly Thread _messageThread;
    private readonly ManualResetEventSlim _windowCreated = new();
    
    // Debounce settings to prevent multiple events for single clipboard operation
    private readonly TimeSpan _debounceDelay = TimeSpan.FromMilliseconds(100);
    private Timer? _debounceTimer;
    private readonly object _debounceLock = new();
    private volatile bool _pendingUpdate;
    
    private nint _hwnd;
    private bool _disposed;
    private NativeMethods.WndProc? _wndProc; // Keep reference to prevent GC
    
    public event EventHandler<ClipboardChangedEventArgs>? ClipboardChanged;
    
    public ClipboardMonitor()
    {
        _messageThread = new Thread(MessageLoop)
        {
            IsBackground = true,
            Name = "ClipboardMonitor"
        };
    }
    
    /// <summary>
    /// Starts monitoring clipboard changes
    /// </summary>
    public void Start()
    {
        if (_disposed)
            throw new ObjectDisposedException(nameof(ClipboardMonitor));
        
        _messageThread.Start();
        
        // Wait for window creation
        if (!_windowCreated.Wait(TimeSpan.FromSeconds(5)))
        {
            throw new InvalidOperationException("Failed to create clipboard monitor window");
        }
        
        _logger.Debug("CLIPBOARD", "Monitor started");
    }
    
    /// <summary>
    /// Stops monitoring clipboard changes
    /// </summary>
    public void Stop()
    {
        if (_hwnd != nint.Zero)
        {
            NativeMethods.PostMessageW(_hwnd, NativeMethods.WM_QUIT, nint.Zero, nint.Zero);
        }
    }
    
    private void MessageLoop()
    {
        try
        {
            CreateWindow();
            _windowCreated.Set();
            
            if (_hwnd == nint.Zero)
            {
                _logger.Error("CLIPBOARD", "Failed to create monitor window");
                return;
            }
            
            // Register for clipboard notifications
            if (!NativeMethods.AddClipboardFormatListener(_hwnd))
            {
                _logger.Error("CLIPBOARD", "Failed to register clipboard listener");
                return;
            }
            
            // Message loop
            while (NativeMethods.GetMessageW(out var msg, nint.Zero, 0, 0))
            {
                NativeMethods.TranslateMessage(ref msg);
                NativeMethods.DispatchMessageW(ref msg);
            }
            
            // Cleanup
            NativeMethods.RemoveClipboardFormatListener(_hwnd);
            NativeMethods.DestroyWindow(_hwnd);
        }
        catch (Exception ex)
        {
            _logger.Error("CLIPBOARD", $"Message loop error: {ex.Message}");
        }
    }
    
    private void CreateWindow()
    {
        _wndProc = WndProc;
        
        var hInstance = NativeMethods.GetModuleHandleW(nint.Zero);
        var className = $"WSClipMonitor_{Guid.NewGuid():N}";
        
        var wndClass = new NativeMethods.WNDCLASS
        {
            lpfnWndProc = Marshal.GetFunctionPointerForDelegate(_wndProc),
            hInstance = hInstance,
            lpszClassName = className
        };
        
        var atom = NativeMethods.RegisterClassW(ref wndClass);
        if (atom == 0)
        {
            _logger.Debug("CLIPBOARD", $"RegisterClass failed: {Marshal.GetLastPInvokeError()}");
            return;
        }
        
        _hwnd = NativeMethods.CreateWindowExW(
            0,
            className,
            "WSClip Clipboard Monitor",
            0,
            0, 0, 0, 0,
            nint.Zero,
            nint.Zero,
            hInstance,
            nint.Zero);
        
        if (_hwnd == nint.Zero)
        {
            _logger.Debug("CLIPBOARD", $"CreateWindow failed: {Marshal.GetLastPInvokeError()}");
        }
    }
    
    private nint WndProc(nint hWnd, uint msg, nint wParam, nint lParam)
    {
        if (msg == NativeMethods.WM_CLIPBOARDUPDATE)
        {
            ScheduleClipboardUpdate();
            return nint.Zero;
        }
        
        return NativeMethods.DefWindowProcW(hWnd, msg, wParam, lParam);
    }
    
    /// <summary>
    /// Schedules a debounced clipboard update
    /// </summary>
    private void ScheduleClipboardUpdate()
    {
        lock (_debounceLock)
        {
            _pendingUpdate = true;
            
            // Reset the timer each time we get an update
            _debounceTimer?.Dispose();
            _debounceTimer = new Timer(
                _ => ProcessDebouncedUpdate(),
                null,
                _debounceDelay,
                Timeout.InfiniteTimeSpan);
        }
    }
    
    /// <summary>
    /// Processes the clipboard update after debounce period
    /// </summary>
    private void ProcessDebouncedUpdate()
    {
        lock (_debounceLock)
        {
            if (!_pendingUpdate) return;
            _pendingUpdate = false;
        }
        
        OnClipboardUpdate();
    }
    
    private void OnClipboardUpdate()
    {
        try
        {
            var content = ClipboardReader.Read();
            
            if (content.Type != ClipboardContentType.None)
            {
                ClipboardChanged?.Invoke(this, new ClipboardChangedEventArgs(content));
            }
        }
        catch (Exception ex)
        {
            _logger.Debug("CLIPBOARD", $"Error reading clipboard: {ex.Message}");
        }
    }
    
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        
        Stop();
        
        lock (_debounceLock)
        {
            _debounceTimer?.Dispose();
            _debounceTimer = null;
        }
        
        _windowCreated.Dispose();
    }
}
