using System.Text.Json.Serialization;

namespace WSClip.Config;

/// <summary>
/// Proxy configuration for SOCKS5 connections
/// </summary>
public sealed record ProxyConfig
{
    [JsonPropertyName("enabled")]
    public bool Enabled { get; init; }
    
    [JsonPropertyName("host")]
    public string Host { get; init; } = "localhost";
    
    [JsonPropertyName("port")]
    public int Port { get; init; } = 9999;
}

/// <summary>
/// Application configuration model
/// </summary>
public sealed record AppConfig
{
    [JsonPropertyName("serverUrl")]
    public string ServerUrl { get; init; } = "";
    
    [JsonPropertyName("secret")]
    public string Secret { get; init; } = "";
    
    [JsonPropertyName("sessionId")]
    public string SessionId { get; init; } = "";
    
    [JsonPropertyName("connectionId")]
    public string ConnectionId { get; init; } = "";
    
    [JsonPropertyName("maxContentSize")]
    public long MaxContentSize { get; init; } = 20 * 1024 * 1024; // 20MB default
    
    [JsonPropertyName("proxy")]
    public ProxyConfig? Proxy { get; init; }
    
    /// <summary>
    /// Gets the WebSocket URL from the server URL
    /// </summary>
    [JsonIgnore]
    public string WebSocketUrl => ServerUrl
        .Replace("https://", "wss://")
        .Replace("http://", "ws://");
}
