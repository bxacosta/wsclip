using System.Text.Json;

namespace WSClip.Config;

/// <summary>
/// Loads and saves configuration from/to JSON files
/// </summary>
public static class ConfigLoader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };
    
    /// <summary>
    /// Gets the default configuration file path following XDG standard
    /// </summary>
    public static string GetDefaultConfigPath()
    {
        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(userProfile, ".config", "wsclip", "config.json");
    }
    
    /// <summary>
    /// Loads configuration from the specified path
    /// </summary>
    public static async Task<AppConfig?> LoadAsync(string path)
    {
        if (!File.Exists(path))
            return null;
        
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<AppConfig>(stream, JsonOptions);
    }
    
    /// <summary>
    /// Saves configuration to the specified path
    /// </summary>
    public static async Task SaveAsync(string path, AppConfig config)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            Directory.CreateDirectory(directory);
        
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, config, JsonOptions);
    }
}
