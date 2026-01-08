using System.Text.Json;
using System.Text.Json.Serialization;

namespace WSClip.Protocol;

/// <summary>
/// Message types defined by the CRSP protocol
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<MessageType>))]
public enum MessageType
{
    // Client to Client (via relay)
    [JsonStringEnumMemberName("data")]
    Data,
    
    [JsonStringEnumMemberName("ack")]
    Ack,
    
    [JsonStringEnumMemberName("control")]
    Control,
    
    // Server to Client
    [JsonStringEnumMemberName("ready")]
    Ready,
    
    [JsonStringEnumMemberName("connection")]
    Connection,
    
    [JsonStringEnumMemberName("error")]
    Error
}

/// <summary>
/// Content type for data messages
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<ContentType>))]
public enum ContentType
{
    [JsonStringEnumMemberName("text")]
    Text,
    
    [JsonStringEnumMemberName("binary")]
    Binary
}

/// <summary>
/// Connection status for connection messages
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<ConnectionStatus>))]
public enum ConnectionStatus
{
    [JsonStringEnumMemberName("connected")]
    Connected,
    
    [JsonStringEnumMemberName("disconnected")]
    Disconnected
}

/// <summary>
/// ACK status for acknowledgment messages
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<AckStatus>))]
public enum AckStatus
{
    [JsonStringEnumMemberName("success")]
    Success,
    
    [JsonStringEnumMemberName("error")]
    Error
}

/// <summary>
/// Message header common to all messages
/// </summary>
public sealed record MessageHeader
{
    [JsonPropertyName("type")]
    public required MessageType Type { get; init; }
    
    [JsonPropertyName("id")]
    public required string Id { get; init; }
    
    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}

/// <summary>
/// Other connection info in ready message
/// </summary>
public sealed record OtherConnection
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }
    
    [JsonPropertyName("address")]
    public string? Address { get; init; }
    
    [JsonPropertyName("connectedAt")]
    public string? ConnectedAt { get; init; }
}

#region Server to Client Messages

/// <summary>
/// Ready message payload
/// </summary>
public sealed record ReadyPayload
{
    [JsonPropertyName("connectionId")]
    public required string ConnectionId { get; init; }
    
    [JsonPropertyName("sessionId")]
    public required string SessionId { get; init; }
    
    [JsonPropertyName("otherConnections")]
    public OtherConnection[] OtherConnections { get; init; } = [];
}

/// <summary>
/// Connection message payload
/// </summary>
public sealed record ConnectionPayload
{
    [JsonPropertyName("connectionId")]
    public required string ConnectionId { get; init; }
    
    [JsonPropertyName("status")]
    public required ConnectionStatus Status { get; init; }
}

/// <summary>
/// Error message payload
/// </summary>
public sealed record ErrorPayload
{
    [JsonPropertyName("code")]
    public required string Code { get; init; }
    
    [JsonPropertyName("message")]
    public required string Message { get; init; }
}

#endregion

#region Client to Client Messages

/// <summary>
/// Data message metadata
/// </summary>
public sealed record DataMetadata
{
    [JsonPropertyName("mimeType")]
    public string? MimeType { get; init; }
    
    [JsonPropertyName("filename")]
    public string? Filename { get; init; }
    
    [JsonPropertyName("size")]
    public long? Size { get; init; }
    
    [JsonPropertyName("width")]
    public int? Width { get; init; }
    
    [JsonPropertyName("height")]
    public int? Height { get; init; }
}

/// <summary>
/// Data message payload
/// </summary>
public sealed record DataPayload
{
    [JsonPropertyName("contentType")]
    public required ContentType ContentType { get; init; }
    
    [JsonPropertyName("data")]
    public required string Data { get; init; }
    
    [JsonPropertyName("metadata")]
    public DataMetadata? Metadata { get; init; }
}

/// <summary>
/// ACK message payload
/// </summary>
public sealed record AckPayload
{
    [JsonPropertyName("messageId")]
    public required string MessageId { get; init; }
    
    [JsonPropertyName("status")]
    public required AckStatus Status { get; init; }
    
    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; init; }
}

/// <summary>
/// Control message payload
/// </summary>
public sealed record ControlPayload
{
    [JsonPropertyName("command")]
    public required string Command { get; init; }
    
    [JsonPropertyName("metadata")]
    public Dictionary<string, object>? Metadata { get; init; }
}

#endregion

#region Complete Message Types

/// <summary>
/// Base message structure
/// </summary>
public record Message
{
    [JsonPropertyName("header")]
    public required MessageHeader Header { get; init; }
}

/// <summary>
/// Ready message from server
/// </summary>
public sealed record ReadyMessage : Message
{
    [JsonPropertyName("payload")]
    public required ReadyPayload Payload { get; init; }
}

/// <summary>
/// Connection status message from server
/// </summary>
public sealed record ConnectionMessage : Message
{
    [JsonPropertyName("payload")]
    public required ConnectionPayload Payload { get; init; }
}

/// <summary>
/// Error message from server
/// </summary>
public sealed record ErrorMessage : Message
{
    [JsonPropertyName("payload")]
    public required ErrorPayload Payload { get; init; }
}

/// <summary>
/// Data message for content transfer
/// </summary>
public sealed record DataMessage : Message
{
    [JsonPropertyName("payload")]
    public required DataPayload Payload { get; init; }
}

/// <summary>
/// Acknowledgment message
/// </summary>
public sealed record AckMessage : Message
{
    [JsonPropertyName("payload")]
    public required AckPayload Payload { get; init; }
}

/// <summary>
/// Control message
/// </summary>
public sealed record ControlMessage : Message
{
    [JsonPropertyName("payload")]
    public required ControlPayload Payload { get; init; }
}

#endregion
