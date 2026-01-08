using System.Runtime.InteropServices;
using System.Text;
using WSClip.Utils;

namespace WSClip.Clipboard;

/// <summary>
/// Reads content from the Windows clipboard
/// </summary>
public static class ClipboardReader
{
    private static readonly Logger _logger = Logger.Instance;

    /// <summary>
    /// Reads current clipboard content
    /// </summary>
    public static ClipboardContent Read()
    {
        if (!NativeMethods.OpenClipboard(nint.Zero))
        {
            _logger.Debug("CLIPBOARD", "Failed to open clipboard");
            return ClipboardContent.Empty;
        }

        try
        {
            return ReadInternal();
        }
        finally
        {
            NativeMethods.CloseClipboard();
        }
    }

    private static ClipboardContent ReadInternal()
    {
        // Check for files first (HDROP)
        if (NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_HDROP))
        {
            return ReadFiles();
        }

        // Check for images (DIB format)
        if (NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_DIBV5) ||
            NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_DIB))
        {
            return ReadImage();
        }

        // Check for text
        if (NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_UNICODETEXT))
        {
            return ReadUnicodeText();
        }

        if (NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_TEXT))
        {
            return ReadAnsiText();
        }

        return ClipboardContent.Empty;
    }

    private static ClipboardContent ReadFiles()
    {
        var hDrop = NativeMethods.GetClipboardData(NativeMethods.CF_HDROP);
        if (hDrop == nint.Zero)
            return ClipboardContent.Empty;

        // Get file count
        uint count = NativeMethods.DragQueryFileW(hDrop, 0xFFFFFFFF, null, 0);

        if (count == 0)
            return ClipboardContent.Empty;

        if (count > 1)
        {
            _logger.Warn("CLIPBOARD", "Multiple files not supported, clipboard change ignored");
            return new ClipboardContent { Type = ClipboardContentType.MultipleFiles };
        }

        // Get first file path
        var buffer = new char[260];
        uint len = NativeMethods.DragQueryFileW(hDrop, 0, buffer, 260);
        var path = new string(buffer, 0, (int)len);

        // Check if it's a directory
        if (Directory.Exists(path))
        {
            _logger.Warn("CLIPBOARD", "Directory copy not supported, clipboard change ignored");
            return new ClipboardContent { Type = ClipboardContentType.Directory };
        }

        if (!File.Exists(path))
        {
            _logger.Debug("CLIPBOARD", $"File not found: {path}");
            return ClipboardContent.Empty;
        }

        try
        {
            var fileData = File.ReadAllBytes(path);
            var mimeType = GetMimeType(path);

            return ClipboardContent.FromFile(path, fileData, mimeType);
        }
        catch (Exception ex)
        {
            _logger.Warn("CLIPBOARD", $"Failed to read file: {ex.Message}");
            return ClipboardContent.Empty;
        }
    }

    private static ClipboardContent ReadImage()
    {
        uint format = NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_DIBV5)
            ? NativeMethods.CF_DIBV5
            : NativeMethods.CF_DIB;

        var hData = NativeMethods.GetClipboardData(format);
        if (hData == nint.Zero)
            return ClipboardContent.Empty;

        var ptr = NativeMethods.GlobalLock(hData);
        if (ptr == nint.Zero)
            return ClipboardContent.Empty;

        try
        {
            var size = (int)NativeMethods.GlobalSize(hData);
            
            // Read BITMAPINFOHEADER
            var header = Marshal.PtrToStructure<NativeMethods.BITMAPINFOHEADER>(ptr);
            int width = header.biWidth;
            int height = Math.Abs(header.biHeight);
            int bitCount = header.biBitCount;

            // Convert DIB to PNG
            var pngData = ConvertDibToPng(ptr, size, width, height, bitCount);
            
            if (pngData is null)
                return ClipboardContent.Empty;

            return ClipboardContent.FromImage(pngData, width, height);
        }
        finally
        {
            NativeMethods.GlobalUnlock(hData);
        }
    }

    private static byte[]? ConvertDibToPng(nint dibPtr, int dibSize, int width, int height, int bitCount)
    {
        try
        {
            // Read DIB data
            byte[] dibData = new byte[dibSize];
            Marshal.Copy(dibPtr, dibData, 0, dibSize);

            // Calculate offsets
            int headerSize = Marshal.SizeOf<NativeMethods.BITMAPINFOHEADER>();
            int colorTableSize = 0;
            
            if (bitCount <= 8)
            {
                int colorCount = 1 << bitCount;
                colorTableSize = colorCount * 4; // RGBQUAD is 4 bytes
            }

            int pixelOffset = headerSize + colorTableSize;
            int stride = ((width * bitCount + 31) / 32) * 4;
            int pixelDataSize = stride * height;

            // Create BMP file in memory
            using var bmpStream = new MemoryStream();
            using var writer = new BinaryWriter(bmpStream);

            // BMP File Header (14 bytes)
            writer.Write((byte)'B');
            writer.Write((byte)'M');
            writer.Write(14 + dibSize); // File size
            writer.Write((short)0); // Reserved
            writer.Write((short)0); // Reserved
            writer.Write(14 + pixelOffset); // Pixel data offset

            // Write DIB data (header + color table + pixels)
            writer.Write(dibData);

            bmpStream.Position = 0;

            // Use System.Drawing to convert BMP to PNG
            using var bitmap = new System.Drawing.Bitmap(bmpStream);
            using var pngStream = new MemoryStream();
            bitmap.Save(pngStream, System.Drawing.Imaging.ImageFormat.Png);
            return pngStream.ToArray();
        }
        catch (Exception ex)
        {
            _logger.Debug("CLIPBOARD", $"Failed to convert DIB to PNG: {ex.Message}");
            return null;
        }
    }

    private static ClipboardContent ReadUnicodeText()
    {
        var hData = NativeMethods.GetClipboardData(NativeMethods.CF_UNICODETEXT);
        if (hData == nint.Zero)
            return ClipboardContent.Empty;

        var ptr = NativeMethods.GlobalLock(hData);
        if (ptr == nint.Zero)
            return ClipboardContent.Empty;

        try
        {
            var text = Marshal.PtrToStringUni(ptr);
            return string.IsNullOrEmpty(text) 
                ? ClipboardContent.Empty 
                : ClipboardContent.FromText(text);
        }
        finally
        {
            NativeMethods.GlobalUnlock(hData);
        }
    }

    private static ClipboardContent ReadAnsiText()
    {
        var hData = NativeMethods.GetClipboardData(NativeMethods.CF_TEXT);
        if (hData == nint.Zero)
            return ClipboardContent.Empty;

        var ptr = NativeMethods.GlobalLock(hData);
        if (ptr == nint.Zero)
            return ClipboardContent.Empty;

        try
        {
            var text = Marshal.PtrToStringAnsi(ptr);
            return string.IsNullOrEmpty(text) 
                ? ClipboardContent.Empty 
                : ClipboardContent.FromText(text);
        }
        finally
        {
            NativeMethods.GlobalUnlock(hData);
        }
    }

    private static string GetMimeType(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".txt" => "text/plain",
            ".html" or ".htm" => "text/html",
            ".css" => "text/css",
            ".js" => "application/javascript",
            ".json" => "application/json",
            ".xml" => "application/xml",
            ".pdf" => "application/pdf",
            ".zip" => "application/zip",
            ".tar" => "application/x-tar",
            ".gz" or ".gzip" => "application/gzip",
            ".7z" => "application/x-7z-compressed",
            ".rar" => "application/vnd.rar",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls" => "application/vnd.ms-excel",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".bmp" => "image/bmp",
            ".svg" => "image/svg+xml",
            ".webp" => "image/webp",
            ".ico" => "image/x-icon",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".ogg" => "audio/ogg",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".avi" => "video/x-msvideo",
            ".mov" => "video/quicktime",
            ".exe" => "application/x-msdownload",
            ".dll" => "application/x-msdownload",
            _ => "application/octet-stream"
        };
    }
}
