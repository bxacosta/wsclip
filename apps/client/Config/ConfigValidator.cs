using System.Text.RegularExpressions;

namespace WSClip.Config;

/// <summary>
/// Configuration validation result
/// </summary>
public sealed record ValidationResult(bool IsValid, string? ErrorMessage = null)
{
    public static ValidationResult Success => new(true);
    public static ValidationResult Failure(string message) => new(false, message);
}

/// <summary>
/// Validates application configuration
/// </summary>
public static partial class ConfigValidator
{
    [GeneratedRegex(@"^[a-zA-Z0-9]{8}$")]
    private static partial Regex SessionIdRegex();
    
    [GeneratedRegex(@"^wss?://")]
    private static partial Regex ServerUrlRegex();
    
    /// <summary>
    /// Validates the entire configuration
    /// </summary>
    public static ValidationResult Validate(AppConfig config)
    {
        // Server URL validation
        if (string.IsNullOrWhiteSpace(config.ServerUrl))
            return ValidationResult.Failure("serverUrl cannot be empty");
        
        if (!ServerUrlRegex().IsMatch(config.ServerUrl))
            return ValidationResult.Failure("serverUrl must start with ws:// or wss://");
        
        // Secret validation
        if (string.IsNullOrWhiteSpace(config.Secret))
            return ValidationResult.Failure("secret cannot be empty");
        
        // Session ID validation
        if (string.IsNullOrWhiteSpace(config.SessionId))
            return ValidationResult.Failure("sessionId cannot be empty");
        
        if (!SessionIdRegex().IsMatch(config.SessionId))
            return ValidationResult.Failure("sessionId must be exactly 8 alphanumeric characters");
        
        // Connection ID validation
        if (string.IsNullOrWhiteSpace(config.ConnectionId))
            return ValidationResult.Failure("connectionId cannot be empty");
        
        // Max content size validation
        if (config.MaxContentSize <= 0)
            return ValidationResult.Failure("maxContentSize must be positive");
        
        // Proxy validation (if enabled)
        if (config.Proxy is { Enabled: true })
        {
            if (string.IsNullOrWhiteSpace(config.Proxy.Host))
                return ValidationResult.Failure("proxy.host cannot be empty when proxy is enabled");
            
            if (config.Proxy.Port is <= 0 or > 65535)
                return ValidationResult.Failure("proxy.port must be between 1 and 65535");
        }
        
        return ValidationResult.Success;
    }
    
    /// <summary>
    /// Generates a random session ID (8 alphanumeric characters)
    /// </summary>
    public static string GenerateSessionId()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return string.Create(8, chars, (span, chars) =>
        {
            for (int i = 0; i < span.Length; i++)
                span[i] = chars[Random.Shared.Next(chars.Length)];
        });
    }
}
