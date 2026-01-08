namespace WSClip.Clipboard;

/// <summary>
/// Types of clipboard content
/// </summary>
public enum ClipboardContentType
{
    None,
    Text,
    Image,
    File,
    MultipleFiles,  // Not supported
    Directory       // Not supported
}

/// <summary>
/// Represents clipboard content with type and data
/// </summary>
public sealed record ClipboardContent
{
    public required ClipboardContentType Type { get; init; }
    
    /// <summary>
    /// Text content (for Text type)
    /// </summary>
    public string? Text { get; init; }
    
    /// <summary>
    /// Image data as PNG bytes (for Image type)
    /// </summary>
    public byte[]? ImageData { get; init; }
    
    /// <summary>
    /// Image width in pixels (for Image type)
    /// </summary>
    public int ImageWidth { get; init; }
    
    /// <summary>
    /// Image height in pixels (for Image type)
    /// </summary>
    public int ImageHeight { get; init; }
    
    /// <summary>
    /// File path (for File type)
    /// </summary>
    public string? FilePath { get; init; }
    
    /// <summary>
    /// File bytes (for File type, when read)
    /// </summary>
    public byte[]? FileData { get; init; }
    
    /// <summary>
    /// Original filename (for File type)
    /// </summary>
    public string? FileName { get; init; }
    
    /// <summary>
    /// MIME type for files
    /// </summary>
    public string? MimeType { get; init; }
    
    /// <summary>
    /// Gets the size in bytes of the content
    /// </summary>
    public long Size => Type switch
    {
        ClipboardContentType.Text => System.Text.Encoding.UTF8.GetByteCount(Text ?? ""),
        ClipboardContentType.Image => ImageData?.Length ?? 0,
        ClipboardContentType.File => FileData?.Length ?? 0,
        _ => 0
    };
    
    /// <summary>
    /// Creates empty clipboard content
    /// </summary>
    public static ClipboardContent Empty => new() { Type = ClipboardContentType.None };
    
    /// <summary>
    /// Creates text clipboard content
    /// </summary>
    public static ClipboardContent FromText(string text) => new()
    {
        Type = ClipboardContentType.Text,
        Text = text
    };
    
    /// <summary>
    /// Creates image clipboard content
    /// </summary>
    public static ClipboardContent FromImage(byte[] pngData, int width, int height) => new()
    {
        Type = ClipboardContentType.Image,
        ImageData = pngData,
        ImageWidth = width,
        ImageHeight = height
    };
    
    /// <summary>
    /// Creates file clipboard content
    /// </summary>
    public static ClipboardContent FromFile(string path, byte[] data, string mimeType) => new()
    {
        Type = ClipboardContentType.File,
        FilePath = path,
        FileName = Path.GetFileName(path),
        FileData = data,
        MimeType = mimeType
    };
}
