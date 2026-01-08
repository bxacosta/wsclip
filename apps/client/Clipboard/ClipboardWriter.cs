using System.Runtime.InteropServices;
using WSClip.Utils;

namespace WSClip.Clipboard;

/// <summary>
/// Writes content to the Windows clipboard
/// </summary>
public static class ClipboardWriter
{
    private static readonly Logger _logger = Logger.Instance;

    /// <summary>
    /// Writes text to clipboard
    /// </summary>
    public static bool WriteText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return false;

        if (!NativeMethods.OpenClipboard(nint.Zero))
        {
            _logger.Debug("CLIPBOARD", "Failed to open clipboard for writing");
            return false;
        }

        try
        {
            NativeMethods.EmptyClipboard();

            var bytes = System.Text.Encoding.Unicode.GetBytes(text + "\0");
            var hGlobal = NativeMethods.GlobalAlloc(NativeMethods.GHND, (nuint)bytes.Length);
            
            if (hGlobal == nint.Zero)
            {
                _logger.Debug("CLIPBOARD", "Failed to allocate memory");
                return false;
            }

            var ptr = NativeMethods.GlobalLock(hGlobal);
            if (ptr == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                return false;
            }

            try
            {
                Marshal.Copy(bytes, 0, ptr, bytes.Length);
            }
            finally
            {
                NativeMethods.GlobalUnlock(hGlobal);
            }

            if (NativeMethods.SetClipboardData(NativeMethods.CF_UNICODETEXT, hGlobal) == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                _logger.Debug("CLIPBOARD", "Failed to set clipboard data");
                return false;
            }

            return true;
        }
        finally
        {
            NativeMethods.CloseClipboard();
        }
    }

    /// <summary>
    /// Writes image (PNG) to clipboard as DIB
    /// </summary>
    public static bool WriteImage(byte[] pngData)
    {
        if (pngData is null || pngData.Length == 0)
            return false;

        try
        {
            using var pngStream = new MemoryStream(pngData);
            using var bitmap = new System.Drawing.Bitmap(pngStream);
            
            return WriteImageBitmap(bitmap);
        }
        catch (Exception ex)
        {
            _logger.Debug("CLIPBOARD", $"Failed to write image: {ex.Message}");
            return false;
        }
    }

    private static bool WriteImageBitmap(System.Drawing.Bitmap bitmap)
    {
        if (!NativeMethods.OpenClipboard(nint.Zero))
        {
            _logger.Debug("CLIPBOARD", "Failed to open clipboard for image");
            return false;
        }

        try
        {
            NativeMethods.EmptyClipboard();

            // Convert bitmap to DIB
            var dibData = BitmapToDib(bitmap);
            if (dibData is null)
                return false;

            var hGlobal = NativeMethods.GlobalAlloc(NativeMethods.GHND, (nuint)dibData.Length);
            if (hGlobal == nint.Zero)
                return false;

            var ptr = NativeMethods.GlobalLock(hGlobal);
            if (ptr == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                return false;
            }

            try
            {
                Marshal.Copy(dibData, 0, ptr, dibData.Length);
            }
            finally
            {
                NativeMethods.GlobalUnlock(hGlobal);
            }

            if (NativeMethods.SetClipboardData(NativeMethods.CF_DIB, hGlobal) == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                return false;
            }

            return true;
        }
        finally
        {
            NativeMethods.CloseClipboard();
        }
    }

    private static byte[]? BitmapToDib(System.Drawing.Bitmap bitmap)
    {
        try
        {
            var rect = new System.Drawing.Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var bitmapData = bitmap.LockBits(rect, System.Drawing.Imaging.ImageLockMode.ReadOnly, 
                System.Drawing.Imaging.PixelFormat.Format32bppArgb);

            try
            {
                int stride = bitmapData.Stride;
                int height = bitmap.Height;
                int width = bitmap.Width;
                int pixelDataSize = Math.Abs(stride) * height;

                // Create BITMAPINFOHEADER
                var header = new NativeMethods.BITMAPINFOHEADER
                {
                    biSize = (uint)Marshal.SizeOf<NativeMethods.BITMAPINFOHEADER>(),
                    biWidth = width,
                    biHeight = height, // Positive = bottom-up DIB
                    biPlanes = 1,
                    biBitCount = 32,
                    biCompression = 0, // BI_RGB
                    biSizeImage = (uint)pixelDataSize,
                    biXPelsPerMeter = 0,
                    biYPelsPerMeter = 0,
                    biClrUsed = 0,
                    biClrImportant = 0
                };

                int headerSize = Marshal.SizeOf<NativeMethods.BITMAPINFOHEADER>();
                byte[] dibData = new byte[headerSize + pixelDataSize];

                // Write header
                var headerPtr = Marshal.AllocHGlobal(headerSize);
                try
                {
                    Marshal.StructureToPtr(header, headerPtr, false);
                    Marshal.Copy(headerPtr, dibData, 0, headerSize);
                }
                finally
                {
                    Marshal.FreeHGlobal(headerPtr);
                }

                // Write pixel data (need to flip vertically for bottom-up DIB)
                byte[] pixelData = new byte[pixelDataSize];
                Marshal.Copy(bitmapData.Scan0, pixelData, 0, pixelDataSize);

                // Flip rows for bottom-up format
                int rowSize = Math.Abs(stride);
                for (int y = 0; y < height; y++)
                {
                    int srcOffset = y * rowSize;
                    int dstOffset = headerSize + (height - 1 - y) * rowSize;
                    Array.Copy(pixelData, srcOffset, dibData, dstOffset, rowSize);
                }

                return dibData;
            }
            finally
            {
                bitmap.UnlockBits(bitmapData);
            }
        }
        catch (Exception ex)
        {
            _logger.Debug("CLIPBOARD", $"Failed to convert bitmap to DIB: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Writes a file reference to clipboard (HDROP format)
    /// </summary>
    public static bool WriteFile(string filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
        {
            _logger.Debug("CLIPBOARD", $"File not found: {filePath}");
            return false;
        }

        if (!NativeMethods.OpenClipboard(nint.Zero))
        {
            _logger.Debug("CLIPBOARD", "Failed to open clipboard for file");
            return false;
        }

        try
        {
            NativeMethods.EmptyClipboard();

            // Create DROPFILES structure
            // DROPFILES structure:
            // - pFiles (4 bytes): offset to file list
            // - pt (8 bytes): drop point (unused)
            // - fNC (4 bytes): NC area flag (unused)
            // - fWide (4 bytes): wide char flag
            // Total header: 20 bytes

            var filePathBytes = System.Text.Encoding.Unicode.GetBytes(filePath + "\0\0");
            int dropFilesSize = 20; // sizeof(DROPFILES)
            int totalSize = dropFilesSize + filePathBytes.Length;

            var hGlobal = NativeMethods.GlobalAlloc(NativeMethods.GHND, (nuint)totalSize);
            if (hGlobal == nint.Zero)
                return false;

            var ptr = NativeMethods.GlobalLock(hGlobal);
            if (ptr == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                return false;
            }

            try
            {
                // Write DROPFILES structure
                Marshal.WriteInt32(ptr, 0, dropFilesSize); // pFiles offset
                Marshal.WriteInt32(ptr, 4, 0); // pt.x
                Marshal.WriteInt32(ptr, 8, 0); // pt.y
                Marshal.WriteInt32(ptr, 12, 0); // fNC
                Marshal.WriteInt32(ptr, 16, 1); // fWide = TRUE (Unicode)

                // Write file path
                Marshal.Copy(filePathBytes, 0, ptr + dropFilesSize, filePathBytes.Length);
            }
            finally
            {
                NativeMethods.GlobalUnlock(hGlobal);
            }

            if (NativeMethods.SetClipboardData(NativeMethods.CF_HDROP, hGlobal) == nint.Zero)
            {
                NativeMethods.GlobalFree(hGlobal);
                _logger.Debug("CLIPBOARD", "Failed to set file clipboard data");
                return false;
            }

            return true;
        }
        finally
        {
            NativeMethods.CloseClipboard();
        }
    }
}
