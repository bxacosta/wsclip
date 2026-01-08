using System.Text.Json;

namespace WSClip.Protocol;

/// <summary>
/// Factory for creating and serializing protocol messages
/// </summary>
public static class MessageFactory
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };
    
    /// <summary>
    /// Creates a new message header with UUID and timestamp
    /// </summary>
    public static MessageHeader CreateHeader(MessageType type) => new()
    {
        Type = type,
        Id = Guid.NewGuid().ToString(),
        Timestamp = DateTime.UtcNow.ToString("o")
    };
    
    /// <summary>
    /// Creates a DATA message for text content
    /// </summary>
    public static DataMessage CreateTextData(string text) => new()
    {
        Header = CreateHeader(MessageType.Data),
        Payload = new DataPayload
        {
            ContentType = ContentType.Text,
            Data = text,
            Metadata = new DataMetadata
            {
                MimeType = "text/plain",
                Size = System.Text.Encoding.UTF8.GetByteCount(text)
            }
        }
    };
    
    /// <summary>
    /// Creates a DATA message for binary content (image)
    /// </summary>
    public static DataMessage CreateImageData(byte[] imageBytes, int width, int height) => new()
    {
        Header = CreateHeader(MessageType.Data),
        Payload = new DataPayload
        {
            ContentType = ContentType.Binary,
            Data = Convert.ToBase64String(imageBytes),
            Metadata = new DataMetadata
            {
                MimeType = "image/png",
                Size = imageBytes.Length,
                Width = width,
                Height = height
            }
        }
    };
    
    /// <summary>
    /// Creates a DATA message for file content
    /// </summary>
    public static DataMessage CreateFileData(byte[] fileBytes, string filename, string mimeType) => new()
    {
        Header = CreateHeader(MessageType.Data),
        Payload = new DataPayload
        {
            ContentType = ContentType.Binary,
            Data = Convert.ToBase64String(fileBytes),
            Metadata = new DataMetadata
            {
                MimeType = mimeType,
                Filename = filename,
                Size = fileBytes.Length
            }
        }
    };
    
    /// <summary>
    /// Creates an ACK message
    /// </summary>
    public static AckMessage CreateAck(string messageId, AckStatus status) => new()
    {
        Header = CreateHeader(MessageType.Ack),
        Payload = new AckPayload
        {
            MessageId = messageId,
            Status = status
        }
    };
    
    /// <summary>
    /// Creates a CONTROL message
    /// </summary>
    public static ControlMessage CreateControl(string command, Dictionary<string, object>? metadata = null) => new()
    {
        Header = CreateHeader(MessageType.Control),
        Payload = new ControlPayload
        {
            Command = command,
            Metadata = metadata
        }
    };
    
    /// <summary>
    /// Serializes a message to JSON
    /// </summary>
    public static string Serialize<T>(T message) where T : Message => 
        JsonSerializer.Serialize(message, JsonOptions);
    
    /// <summary>
    /// Extracts the short ID (last segment) from a UUID
    /// </summary>
    public static string GetShortId(string messageId)
    {
        var segments = messageId.Split('-');
        return segments.Length > 0 ? segments[^1] : messageId;
    }
    
    /// <summary>
    /// Deserializes a message from JSON, determining type from header
    /// </summary>
    public static Message? Deserialize(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        
        if (!root.TryGetProperty("header", out var header))
            return null;
        
        if (!header.TryGetProperty("type", out var typeElement))
            return null;
        
        var typeStr = typeElement.GetString();
        
        return typeStr switch
        {
            "ready" => JsonSerializer.Deserialize<ReadyMessage>(json, JsonOptions),
            "connection" => JsonSerializer.Deserialize<ConnectionMessage>(json, JsonOptions),
            "error" => JsonSerializer.Deserialize<ErrorMessage>(json, JsonOptions),
            "data" => JsonSerializer.Deserialize<DataMessage>(json, JsonOptions),
            "ack" => JsonSerializer.Deserialize<AckMessage>(json, JsonOptions),
            "control" => JsonSerializer.Deserialize<ControlMessage>(json, JsonOptions),
            _ => null
        };
    }
}
