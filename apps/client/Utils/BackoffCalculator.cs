namespace WSClip.Utils;

/// <summary>
/// Calculates exponential backoff delays for reconnection attempts
/// </summary>
public sealed class BackoffCalculator
{
    private readonly int _initialDelayMs;
    private readonly int _maxDelayMs;
    private readonly double _multiplier;
    private int _attempt;
    
    public BackoffCalculator(int initialDelayMs = 1000, int maxDelayMs = 30000, double multiplier = 2.0)
    {
        _initialDelayMs = initialDelayMs;
        _maxDelayMs = maxDelayMs;
        _multiplier = multiplier;
        _attempt = 0;
    }
    
    /// <summary>
    /// Gets the next delay in milliseconds and increments the attempt counter
    /// </summary>
    public int NextDelay()
    {
        var delay = (int)(_initialDelayMs * Math.Pow(_multiplier, _attempt));
        delay = Math.Min(delay, _maxDelayMs);
        _attempt++;
        return delay;
    }
    
    /// <summary>
    /// Gets the current attempt number (1-based)
    /// </summary>
    public int CurrentAttempt => _attempt + 1;
    
    /// <summary>
    /// Resets the backoff calculator to initial state
    /// </summary>
    public void Reset() => _attempt = 0;
}
