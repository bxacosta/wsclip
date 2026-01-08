namespace WSClip.Utils;

/// <summary>
/// Utility methods for formatting file sizes in human-readable format
/// </summary>
public static class SizeFormatter
{
    private static readonly string[] SizeUnits = ["bytes", "KB", "MB", "GB"];
    
    /// <summary>
    /// Formats a byte count as a human-readable string
    /// </summary>
    public static string Format(long bytes)
    {
        if (bytes < 1024)
            return $"{bytes} bytes";
        
        double size = bytes;
        int unitIndex = 0;
        
        while (size >= 1024 && unitIndex < SizeUnits.Length - 1)
        {
            size /= 1024;
            unitIndex++;
        }
        
        return unitIndex == 1 
            ? $"{size:F1} {SizeUnits[unitIndex]}" 
            : $"{size:F2} {SizeUnits[unitIndex]}";
    }
    
    /// <summary>
    /// Formats dimensions for images
    /// </summary>
    public static string FormatDimensions(int width, int height) => $"{width}x{height}";
}
