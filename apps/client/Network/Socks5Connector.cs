using System.Net.Sockets;
using System.Text;
using WSClip.Config;

namespace WSClip.Network;

/// <summary>
/// SOCKS5 proxy connector for routing TCP connections through a SOCKS5 proxy
/// </summary>
public sealed class Socks5Connector
{
    private readonly string _proxyHost;
    private readonly int _proxyPort;
    
    public Socks5Connector(ProxyConfig config)
    {
        _proxyHost = config.Host;
        _proxyPort = config.Port;
    }
    
    public Socks5Connector(string host, int port)
    {
        _proxyHost = host;
        _proxyPort = port;
    }
    
    /// <summary>
    /// Connects to the target host through the SOCKS5 proxy
    /// </summary>
    public async Task<Socket> ConnectAsync(string targetHost, int targetPort, CancellationToken cancellationToken = default)
    {
        var socket = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        
        try
        {
            // Connect to proxy server
            await socket.ConnectAsync(_proxyHost, _proxyPort, cancellationToken);
            
            // SOCKS5 Handshake
            await PerformHandshakeAsync(socket, cancellationToken);
            
            // SOCKS5 Connect
            await PerformConnectAsync(socket, targetHost, targetPort, cancellationToken);
            
            return socket;
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }
    
    private static async Task PerformHandshakeAsync(Socket socket, CancellationToken cancellationToken)
    {
        // Send greeting: version 5, 1 method (no authentication)
        byte[] greeting = [0x05, 0x01, 0x00];
        await socket.SendAsync(greeting, SocketFlags.None, cancellationToken);
        
        // Receive response
        byte[] response = new byte[2];
        int received = await socket.ReceiveAsync(response, SocketFlags.None, cancellationToken);
        
        if (received != 2)
            throw new Socks5Exception("Invalid handshake response length");
        
        if (response[0] != 0x05)
            throw new Socks5Exception($"Invalid SOCKS version: {response[0]}");
        
        if (response[1] != 0x00)
            throw new Socks5Exception($"No acceptable authentication method. Server returned: {response[1]}");
    }
    
    private static async Task PerformConnectAsync(Socket socket, string targetHost, int targetPort, CancellationToken cancellationToken)
    {
        // Build connect request
        byte[] hostBytes = Encoding.ASCII.GetBytes(targetHost);
        byte[] request = new byte[4 + 1 + hostBytes.Length + 2];
        
        request[0] = 0x05; // Version
        request[1] = 0x01; // Connect command
        request[2] = 0x00; // Reserved
        request[3] = 0x03; // Domain name address type
        request[4] = (byte)hostBytes.Length;
        
        Array.Copy(hostBytes, 0, request, 5, hostBytes.Length);
        
        // Port in network byte order (big-endian)
        request[5 + hostBytes.Length] = (byte)(targetPort >> 8);
        request[5 + hostBytes.Length + 1] = (byte)(targetPort & 0xFF);
        
        await socket.SendAsync(request, SocketFlags.None, cancellationToken);
        
        // Read response (at least 10 bytes for IPv4 response)
        byte[] response = new byte[10];
        int received = await socket.ReceiveAsync(response, SocketFlags.None, cancellationToken);
        
        if (received < 2)
            throw new Socks5Exception("Connect response too short");
        
        if (response[0] != 0x05)
            throw new Socks5Exception($"Invalid SOCKS version in response: {response[0]}");
        
        if (response[1] != 0x00)
        {
            var errorMessage = GetErrorMessage(response[1]);
            throw new Socks5Exception($"SOCKS5 connect failed: {errorMessage}");
        }
        
        // Connection established successfully
        // If domain name response, read remaining bytes
        if (received >= 4 && response[3] == 0x03)
        {
            // Domain name - need to read more
            int domainLength = response[4];
            int remaining = domainLength + 2 - (received - 5);
            if (remaining > 0)
            {
                byte[] extra = new byte[remaining];
                await socket.ReceiveAsync(extra, SocketFlags.None, cancellationToken);
            }
        }
    }
    
    private static string GetErrorMessage(byte code) => code switch
    {
        0x01 => "General SOCKS server failure",
        0x02 => "Connection not allowed by ruleset",
        0x03 => "Network unreachable",
        0x04 => "Host unreachable",
        0x05 => "Connection refused",
        0x06 => "TTL expired",
        0x07 => "Command not supported",
        0x08 => "Address type not supported",
        _ => $"Unknown error (code: {code})"
    };
}

/// <summary>
/// Exception thrown for SOCKS5 protocol errors
/// </summary>
public sealed class Socks5Exception : Exception
{
    public Socks5Exception(string message) : base(message) { }
}
