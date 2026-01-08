namespace WSClip.Utils;

/// <summary>
/// Log levels for application logging
/// </summary>
public enum LogLevel
{
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

/// <summary>
/// Simple console logger with configurable log level
/// </summary>
public sealed class Logger
{
    private static Logger? _instance;
    private static readonly Lock _lock = new();
    
    public LogLevel MinLevel { get; set; } = LogLevel.Info;
    
    public static Logger Instance
    {
        get
        {
            if (_instance is null)
            {
                lock (_lock)
                {
                    _instance ??= new Logger();
                }
            }
            return _instance;
        }
    }
    
    private Logger() { }
    
    public void Debug(string message) => Log(LogLevel.Debug, message);
    public void Info(string message) => Log(LogLevel.Info, message);
    public void Warn(string message) => Log(LogLevel.Warn, message);
    public void Error(string message) => Log(LogLevel.Error, message);
    
    public void Debug(string category, string message) => Log(LogLevel.Debug, category, message);
    public void Info(string category, string message) => Log(LogLevel.Info, category, message);
    public void Warn(string category, string message) => Log(LogLevel.Warn, category, message);
    public void Error(string category, string message) => Log(LogLevel.Error, category, message);
    
    private void Log(LogLevel level, string message)
    {
        if (level < MinLevel) return;
        
        var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        var levelStr = level.ToString().ToUpper();
        Console.WriteLine($"{timestamp} [{levelStr}] {message}");
    }
    
    private void Log(LogLevel level, string category, string message)
    {
        if (level < MinLevel) return;
        
        var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
        var levelStr = level.ToString().ToUpper();
        Console.WriteLine($"{timestamp} [{levelStr}] [{category}] {message}");
    }
}
