using WSClip.Utils;

namespace WSClip.Sync;

/// <summary>
/// Manages temporary files received from partner
/// </summary>
public sealed class TempFileManager : IDisposable
{
    private readonly Logger _logger = Logger.Instance;
    private readonly string _basePath;
    private readonly List<string> _currentFiles = [];
    private readonly object _lock = new();
    private bool _disposed;
    
    public TempFileManager()
    {
        _basePath = Path.Combine(Path.GetTempPath(), "wsclip");
        Directory.CreateDirectory(_basePath);
        _logger.Debug("FILES", $"Temp directory: {_basePath}");
    }
    
    /// <summary>
    /// Gets paths of currently managed files
    /// </summary>
    public IReadOnlyList<string> CurrentFiles
    {
        get
        {
            lock (_lock)
            {
                return [.. _currentFiles];
            }
        }
    }
    
    /// <summary>
    /// Saves received file data and returns paths
    /// </summary>
    public string[] SaveFiles(IEnumerable<(string Name, byte[] Data)> files)
    {
        lock (_lock)
        {
            // Clean previous files
            CleanupCurrent();
            
            var paths = new List<string>();
            
            foreach (var (name, data) in files)
            {
                try
                {
                    var safeName = SanitizeFileName(name);
                    var path = GetUniqueFilePath(safeName);
                    
                    File.WriteAllBytes(path, data);
                    paths.Add(path);
                    _currentFiles.Add(path);
                    
                    _logger.Debug("FILES", $"Saved: {safeName} ({SizeFormatter.Format(data.Length)})");
                }
                catch (Exception ex)
                {
                    _logger.Warn("FILES", $"Failed to save {name}: {ex.Message}");
                }
            }
            
            return [.. paths];
        }
    }
    
    /// <summary>
    /// Cleans up all temp files
    /// </summary>
    public void Cleanup()
    {
        lock (_lock)
        {
            CleanupCurrent();
            
            // Also clean any orphaned files in temp directory
            try
            {
                if (Directory.Exists(_basePath))
                {
                    Directory.Delete(_basePath, recursive: true);
                    _logger.Debug("FILES", "Cleaned up temp directory");
                }
            }
            catch (Exception ex)
            {
                _logger.Debug("FILES", $"Failed to clean temp directory: {ex.Message}");
            }
        }
    }
    
    private void CleanupCurrent()
    {
        foreach (var file in _currentFiles)
        {
            try
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
            catch
            {
                // Ignore errors on cleanup
            }
        }
        _currentFiles.Clear();
    }
    
    private string GetUniqueFilePath(string fileName)
    {
        var baseName = Path.GetFileNameWithoutExtension(fileName);
        var ext = Path.GetExtension(fileName);
        var path = Path.Combine(_basePath, fileName);
        
        var counter = 1;
        while (File.Exists(path))
        {
            path = Path.Combine(_basePath, $"{baseName}_{counter}{ext}");
            counter++;
        }
        
        return path;
    }
    
    private static string SanitizeFileName(string fileName)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(fileName
            .Select(c => invalidChars.Contains(c) ? '_' : c)
            .ToArray());
        
        // Ensure not empty
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            sanitized = "file";
        }
        
        return sanitized;
    }
    
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Cleanup();
    }
}
