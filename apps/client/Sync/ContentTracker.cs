using System.Security.Cryptography;
using System.Text;
using WSClip.Utils;

namespace WSClip.Sync;

/// <summary>
/// Tracks clipboard content to prevent infinite sync loops
/// </summary>
public sealed class ContentTracker
{
    private readonly Logger _logger = Logger.Instance;
    private readonly object _lock = new();
    
    // For preventing echo loops (content received from partner)
    private string? _lastAppliedHash;
    private DateTime _lastAppliedTime = DateTime.MinValue;
    private static readonly TimeSpan SuppressWindow = TimeSpan.FromMilliseconds(500);
    
    // For preventing duplicate sends (same content sent twice)
    private string? _lastSentHash;
    private DateTime _lastSentTime = DateTime.MinValue;
    private static readonly TimeSpan DuplicateSendWindow = TimeSpan.FromMilliseconds(1000);
    
    /// <summary>
    /// Marks content as applied locally (received from partner)
    /// </summary>
    public void MarkAsApplied(byte[]? data, string? text)
    {
        lock (_lock)
        {
            _lastAppliedHash = ComputeHash(data, text);
            _lastAppliedTime = DateTime.UtcNow;
            _logger.Debug("SYNC", $"Marked content as applied: {_lastAppliedHash?[..16]}...");
        }
    }
    
    /// <summary>
    /// Marks content as sent to partner
    /// </summary>
    public void MarkAsSent(byte[]? data, string? text)
    {
        lock (_lock)
        {
            _lastSentHash = ComputeHash(data, text);
            _lastSentTime = DateTime.UtcNow;
        }
    }
    
    /// <summary>
    /// Checks if content should be sent to partner (was not just applied or recently sent)
    /// </summary>
    public bool ShouldSendContent(byte[]? data, string? text)
    {
        lock (_lock)
        {
            var currentHash = ComputeHash(data, text);
            
            // Check if this is content we just received from partner (echo prevention)
            if (DateTime.UtcNow - _lastAppliedTime < SuppressWindow)
            {
                if (currentHash == _lastAppliedHash)
                {
                    _logger.Debug("SYNC", "Content matches last applied, suppressing send");
                    return false;
                }
            }
            
            // Check if we just sent this exact content (duplicate prevention)
            if (DateTime.UtcNow - _lastSentTime < DuplicateSendWindow)
            {
                if (currentHash == _lastSentHash)
                {
                    _logger.Debug("SYNC", "Content matches last sent, suppressing duplicate");
                    return false;
                }
            }
            
            return true;
        }
    }
    
    /// <summary>
    /// Clears tracking state
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            _lastAppliedHash = null;
            _lastAppliedTime = DateTime.MinValue;
            _lastSentHash = null;
            _lastSentTime = DateTime.MinValue;
        }
    }
    
    private static string? ComputeHash(byte[]? data, string? text)
    {
        byte[] bytes;
        
        if (data is { Length: > 0 })
        {
            bytes = data;
        }
        else if (!string.IsNullOrEmpty(text))
        {
            bytes = Encoding.UTF8.GetBytes(text);
        }
        else
        {
            return null;
        }
        
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }
}
