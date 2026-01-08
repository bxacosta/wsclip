namespace WSClip.Config;

/// <summary>
/// Interactive configuration wizard for initial setup
/// </summary>
public static class ConfigWizard
{
    /// <summary>
    /// Runs the interactive configuration wizard
    /// </summary>
    public static async Task<AppConfig> RunAsync(string configPath)
    {
        Console.WriteLine("Welcome to WSClip!");
        Console.WriteLine();
        Console.WriteLine("No configuration found. Let's set up your sync client.");
        Console.WriteLine();
        
        // Server URL
        var serverUrl = Prompt("Server URL (e.g., wss://example.com:3000): ");
        while (string.IsNullOrWhiteSpace(serverUrl) || 
               (!serverUrl.StartsWith("ws://") && !serverUrl.StartsWith("wss://")))
        {
            Console.WriteLine("Error: URL must start with ws:// or wss://");
            serverUrl = Prompt("Server URL: ");
        }
        
        // Secret
        var secret = PromptSecret("Shared secret: ");
        while (string.IsNullOrWhiteSpace(secret))
        {
            Console.WriteLine("Error: Secret cannot be empty");
            secret = PromptSecret("Shared secret: ");
        }
        
        // Session ID
        var defaultSessionId = ConfigValidator.GenerateSessionId();
        var sessionIdInput = Prompt($"Session ID (press Enter for \"{defaultSessionId}\"): ");
        var sessionId = string.IsNullOrWhiteSpace(sessionIdInput) ? defaultSessionId : sessionIdInput;
        
        while (!System.Text.RegularExpressions.Regex.IsMatch(sessionId, @"^[a-zA-Z0-9]{8}$"))
        {
            Console.WriteLine("Error: Session ID must be exactly 8 alphanumeric characters");
            sessionId = Prompt("Session ID: ");
        }
        
        // Connection ID
        var hostname = Environment.MachineName;
        var connectionIdInput = Prompt($"Device name (press Enter for \"{hostname}\"): ");
        var connectionId = string.IsNullOrWhiteSpace(connectionIdInput) ? hostname : connectionIdInput;
        
        // Proxy configuration
        ProxyConfig? proxyConfig = null;
        var useProxy = PromptYesNo("Do you want to use a SOCKS5 proxy? (y/N): ", defaultYes: false);
        
        if (useProxy)
        {
            var proxyHost = Prompt("Proxy host (press Enter for \"localhost\"): ");
            if (string.IsNullOrWhiteSpace(proxyHost)) proxyHost = "localhost";
            
            var proxyPortStr = Prompt("Proxy port (press Enter for \"9999\"): ");
            var proxyPort = string.IsNullOrWhiteSpace(proxyPortStr) ? 9999 : int.Parse(proxyPortStr);
            
            proxyConfig = new ProxyConfig
            {
                Enabled = true,
                Host = proxyHost,
                Port = proxyPort
            };
        }
        
        var config = new AppConfig
        {
            ServerUrl = serverUrl,
            Secret = secret,
            SessionId = sessionId,
            ConnectionId = connectionId,
            MaxContentSize = 20 * 1024 * 1024, // 20MB default
            Proxy = proxyConfig
        };
        
        await ConfigLoader.SaveAsync(configPath, config);
        
        Console.WriteLine();
        Console.WriteLine($"Configuration saved to {configPath}");
        Console.WriteLine();
        
        return config;
    }
    
    private static string Prompt(string message)
    {
        Console.Write(message);
        return Console.ReadLine()?.Trim() ?? "";
    }
    
    private static string PromptSecret(string message)
    {
        Console.Write(message);
        var secret = new System.Text.StringBuilder();
        
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter)
            {
                Console.WriteLine();
                break;
            }
            if (key.Key == ConsoleKey.Backspace && secret.Length > 0)
            {
                secret.Length--;
                Console.Write("\b \b");
            }
            else if (!char.IsControl(key.KeyChar))
            {
                secret.Append(key.KeyChar);
                Console.Write('*');
            }
        }
        
        return secret.ToString();
    }
    
    private static bool PromptYesNo(string message, bool defaultYes)
    {
        Console.Write(message);
        var input = Console.ReadLine()?.Trim().ToLowerInvariant() ?? "";
        
        return input switch
        {
            "y" or "yes" => true,
            "n" or "no" => false,
            "" => defaultYes,
            _ => defaultYes
        };
    }
}
