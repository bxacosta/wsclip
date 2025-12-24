# CRSP - Content Relay Sync Protocol
## Protocol Proposal v1.0

---

## 1. Visión y Objetivos

### 1.1 Propósito

CRSP (Content Relay Sync Protocol) es un protocolo estructurado sobre WebSocket diseñado para sincronización de contenido entre dispositivos a través de un servidor relay stateless. El protocolo proporciona la estructura mínima necesaria para que clientes heterogéneos puedan intercambiar contenido de manera confiable, mientras mantiene la flexibilidad para que cada implementación adapte el protocolo a sus necesidades específicas.

### 1.2 Casos de Uso Objetivo

- Sincronización de clipboard entre dispositivos
- Transferencia de archivos peer-to-peer mediada
- Intercambio de contenido binario o textual
- Sincronización de estado entre aplicaciones
- Cualquier escenario de intercambio de contenido que requiera relay

### 1.3 Principios de Diseño

1. **Stateless Relay**: El servidor no mantiene estado de aplicación, solo facilita la comunicación
2. **Validación Mínima**: El servidor valida estructura crítica, el cliente valida semántica
3. **Extensibilidad Controlada**: Campos principales estrictos, áreas de extensión flexibles
4. **Transparencia**: El servidor relay sin modificar el payload del cliente
5. **Simplicidad**: Solo lo esencial, evitar sobre-ingeniería

---

## 2. Arquitectura del Protocolo

### 2.1 Modelo de Comunicación

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Cliente A  │◄───────►│   Servidor  │◄───────►│  Cliente B  │
│             │         │    Relay    │         │             │
│  (Emisor)   │         │  (Stateless)│         │  (Receptor) │
└─────────────┘         └─────────────┘         └─────────────┘
```

**Características**:
- Canal privado con exactamente 2 participantes
- Comunicación bidireccional simétrica
- Servidor relay transparente (no modifica mensajes de datos)
- Sin persistencia de mensajes

### 2.2 Capas del Protocolo

```
┌─────────────────────────────────────┐
│      Aplicación del Cliente         │  ← Lógica de sincronización
├─────────────────────────────────────┤
│     CRSP Protocol Layer             │  ← Estructura de mensajes
├─────────────────────────────────────┤
│        WebSocket Layer              │  ← Transporte confiable
├─────────────────────────────────────┤
│          TCP/TLS Layer              │  ← Red
└─────────────────────────────────────┘
```

### 2.3 Tipos de Mensajes

El protocolo define tres categorías principales:

1. **Control Messages**: Gestión de conexión y autenticación
2. **Data Messages**: Intercambio de contenido entre clientes
3. **System Messages**: Notificaciones del servidor

---

## 3. Estructura de Mensajes

### 3.1 Formato Base

Todos los mensajes CRSP siguen esta estructura jerárquica:

```typescript
{
  "header": {
    // Información del protocolo - VALIDACIÓN ESTRICTA
  },
  "payload": {
    // Contenido del mensaje - VALIDACIÓN FLEXIBLE
  }
}
```

### 3.2 Header Structure (Obligatorio)

El header contiene metadata del protocolo y es de **validación estricta**:

```typescript
interface MessageHeader {
  type: MessageType;    // REQUERIDO - Tipo de mensaje
  id: string;           // REQUERIDO - UUID v4 único del mensaje
  timestamp: string;    // REQUERIDO - ISO 8601 timestamp
}

type MessageType = 
  // Control Messages (cliente ↔ servidor)
  | "auth"              // Autenticación inicial
  | "control"           // Comando de control genérico
  
  // Data Messages (cliente ↔ cliente via relay)
  | "data"              // Mensaje de datos
  | "ack"               // Confirmación de recepción
  
  // System Messages (servidor → cliente)
  | "connected"         // Confirmación de conexión
  | "peer_event"        // Evento de peer (joined/left)
  | "error"             // Error del servidor
  | "shutdown";         // Servidor apagándose
```

**Reglas de Validación del Header**:
- Todos los campos son **obligatorios**
- `type`: Debe ser uno de los valores del enum `MessageType`
- `id`: Debe ser UUID v4 válido
- `timestamp`: Debe ser ISO 8601 válido
- **No se permiten campos adicionales en el header**

### 3.3 Payload Structure (Variable)

El payload contiene el contenido específico del mensaje. Su estructura varía según el tipo de mensaje y tiene **validación flexible**.

---

## 4. Especificación de Mensajes

### 4.1 Control Messages

#### 4.1.1 AUTH Message (Cliente → Servidor)

**Propósito**: Autenticar al cliente. Debe ser el primer mensaje enviado después de establecer la conexión WebSocket.

**Estructura**:
```typescript
{
  "header": {
    "type": "auth",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2025-12-23T10:30:00.000Z"
  },
  "payload": {
    "secret": string     // REQUERIDO - Secreto compartido del servidor
  }
}
```

**Campos Payload**:
- `secret` (string): REQUERIDO - Secreto de autenticación

**Validación**:
- Header: Validación estricta
- Payload: Solo valida presencia de `secret` (min 1 carácter)
- Campos adicionales: Ignorados

**Comportamiento del Servidor**:
- Si secreto válido: Responde con mensaje `connected`
- Si secreto inválido: Cierra conexión con código 5001
- Si timeout (5s por defecto): Cierra conexión con código 5010

---

#### 4.1.2 CONTROL Message (Cliente ↔ Cliente)

**Propósito**: Mensaje de control genérico y extensible para comandos entre clientes.

**Estructura**:
```typescript
{
  "header": {
    "type": "control",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "command": string,        // REQUERIDO - Nombre del comando
    "params": object | null   // OPCIONAL - Parámetros del comando (flexibles)
  }
}
```

**Campos Payload**:
- `command` (string): REQUERIDO - Identificador del comando (e.g., "sync_request", "pause", "ping")
- `params` (object | null): OPCIONAL - Objeto flexible con parámetros específicos del comando

**Validación**:
- Header: Validación estricta
- Payload: Solo valida que `command` exista como string
- `params`: PASSTHROUGH completo - el servidor no valida contenido

**Comandos Sugeridos** (no exhaustivo, clientes pueden definir propios):
- `"sync_request"`: Solicitar sincronización
- `"pause_sync"`: Pausar sincronización temporal
- `"resume_sync"`: Reanudar sincronización
- `"ping"`: Verificar conectividad a nivel aplicación
- Clientes pueden definir comandos personalizados

**Comportamiento del Servidor**:
- Valida estructura básica
- Relay al peer sin modificaciones
- Si no hay peer: Responde con error `NO_PEER_CONNECTED`

**Ejemplo**:
```json
{
  "header": {
    "type": "control",
    "id": "a1b2c3d4-...",
    "timestamp": "2025-12-23T10:35:00.000Z"
  },
  "payload": {
    "command": "sync_request",
    "params": {
      "full": true,
      "since": "2025-12-23T10:00:00.000Z"
    }
  }
}
```

---

### 4.2 Data Messages

#### 4.2.1 DATA Message (Cliente ↔ Cliente)

**Propósito**: Transmitir contenido (texto o binario) entre clientes.

**Estructura**:
```typescript
{
  "header": {
    "type": "data",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "contentType": "text" | "binary",   // REQUERIDO - Tipo de contenido
    "data": string,                      // REQUERIDO - Contenido (UTF-8 o Base64)
    "metadata": object                   // REQUERIDO - Metadata flexible (PASSTHROUGH)
  }
}
```

**Campos Payload**:

- `contentType` (enum): REQUERIDO
  - `"text"`: Contenido de texto plano (UTF-8)
  - `"binary"`: Contenido binario codificado en Base64

- `data` (string): REQUERIDO
  - Para `"text"`: String UTF-8 directo
  - Para `"binary"`: String Base64 válido

- `metadata` (object): REQUERIDO - Objeto flexible para describir el contenido

**Estructura de Metadata** (validación flexible):

```typescript
interface DataMetadata {
  // CAMPOS SUGERIDOS (el servidor no valida, solo pasa)
  mimeType?: string;        // MIME type (e.g., "text/plain", "image/png")
  size?: number;            // Tamaño en bytes del contenido original
  filename?: string;        // Nombre del archivo (si aplica)
  encoding?: string;        // Codificación (e.g., "utf-8", "base64")
  compressed?: boolean;     // Indica si data está comprimido
  compressionAlgorithm?: string;  // Algoritmo de compresión (e.g., "gzip")
  hash?: string;            // Hash del contenido (e.g., SHA-256)
  
  // Los clientes pueden agregar campos adicionales
  [key: string]: any;
}
```

**Validación**:
- Header: Validación estricta
- Payload:
  - `contentType`: Validación estricta (debe ser "text" o "binary")
  - `data`: Validación estricta
    - Si `contentType: "text"`: Debe ser string válido
    - Si `contentType: "binary"`: Debe ser Base64 válido
  - `metadata`: PASSTHROUGH completo - servidor no valida contenido interno
- Tamaño total del mensaje JSON: No debe exceder `MAX_MESSAGE_SIZE` (configurable, default 100MB)

**Comportamiento del Servidor**:
- Valida estructura según reglas arriba
- Relay al peer sin modificar `payload`
- Si no hay peer: Responde con error `NO_PEER_CONNECTED`
- Si tamaño excede límite: Responde con error `MESSAGE_TOO_LARGE`

**Ejemplo - Texto**:
```json
{
  "header": {
    "type": "data",
    "id": "f47ac10b-...",
    "timestamp": "2025-12-23T10:33:00.123Z"
  },
  "payload": {
    "contentType": "text",
    "data": "Hello World!",
    "metadata": {
      "mimeType": "text/plain",
      "size": 12,
      "encoding": "utf-8"
    }
  }
}
```

**Ejemplo - Imagen con compresión**:
```json
{
  "header": {
    "type": "data",
    "id": "c56a4180-...",
    "timestamp": "2025-12-23T10:34:00.456Z"
  },
  "payload": {
    "contentType": "binary",
    "data": "iVBORw0KGgo...(base64)...CYII=",
    "metadata": {
      "mimeType": "image/png",
      "size": 45678,
      "filename": "screenshot.png",
      "encoding": "base64",
      "compressed": true,
      "compressionAlgorithm": "gzip",
      "hash": "sha256:a3f2e1..."
    }
  }
}
```

---

#### 4.2.2 ACK Message (Cliente ↔ Cliente)

**Propósito**: Confirmar recepción exitosa de un mensaje `data` o `control`.

**Estructura**:
```typescript
{
  "header": {
    "type": "ack",
    "id": "uuid-del-ack",            // ID único de este ACK
    "timestamp": "ISO-8601"
  },
  "payload": {
    "ackFor": string,                 // REQUERIDO - ID del mensaje confirmado
    "status": "success" | "error",    // REQUERIDO - Estado de la recepción
    "details": object | null          // OPCIONAL - Información adicional (PASSTHROUGH)
  }
}
```

**Campos Payload**:
- `ackFor` (string): REQUERIDO - UUID del mensaje que se está confirmando
- `status` (enum): REQUERIDO
  - `"success"`: Mensaje recibido y procesado correctamente
  - `"error"`: Error al procesar el mensaje
- `details` (object | null): OPCIONAL - Información adicional flexible

**Estructura de Details** (sugerida, no validada):
```typescript
interface AckDetails {
  receivedSize?: number;    // Bytes recibidos
  errorCode?: string;       // Código de error (si status="error")
  errorMessage?: string;    // Mensaje de error
  processingTime?: number;  // Tiempo de procesamiento en ms
  
  // Campos personalizados permitidos
  [key: string]: any;
}
```

**Validación**:
- Header: Validación estricta
- Payload:
  - `ackFor`: Validación estricta (debe ser UUID válido)
  - `status`: Validación estricta (debe ser "success" o "error")
  - `details`: PASSTHROUGH completo

**Comportamiento del Servidor**:
- Valida estructura básica
- Relay al peer sin modificaciones
- Si no hay peer: Ignora silenciosamente (ACK puede llegar después de desconexión)

**Ejemplo - ACK exitoso**:
```json
{
  "header": {
    "type": "ack",
    "id": "new-uuid-for-ack",
    "timestamp": "2025-12-23T10:33:01.234Z"
  },
  "payload": {
    "ackFor": "f47ac10b-...",
    "status": "success",
    "details": {
      "receivedSize": 45678,
      "processingTime": 120
    }
  }
}
```

**Ejemplo - ACK con error**:
```json
{
  "header": {
    "type": "ack",
    "id": "another-uuid",
    "timestamp": "2025-12-23T10:33:02.000Z"
  },
  "payload": {
    "ackFor": "c56a4180-...",
    "status": "error",
    "details": {
      "errorCode": "DECODE_FAILED",
      "errorMessage": "Invalid Base64 encoding"
    }
  }
}
```

---

### 4.3 System Messages

Los mensajes del sistema son enviados únicamente por el servidor hacia los clientes. No tienen payload flexible ya que son generados por el servidor.

#### 4.3.1 CONNECTED Message (Servidor → Cliente)

**Propósito**: Confirmar autenticación exitosa e informar estado del canal.

**Estructura**:
```typescript
{
  "header": {
    "type": "connected",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "deviceName": string,           // REQUERIDO - Nombre del dispositivo conectado
    "channelId": string,            // REQUERIDO - ID del canal (8 caracteres)
    "waitingForPeer": boolean,      // REQUERIDO - true si es el único en el canal
    "clientInfo": object | null     // OPCIONAL - Información del cliente
  }
}
```

**Campos Payload**:
- `deviceName` (string): REQUERIDO - Nombre del dispositivo que se conectó
- `channelId` (string): REQUERIDO - ID del canal (8 caracteres alfanuméricos)
- `waitingForPeer` (boolean): REQUERIDO
  - `true`: Es el único dispositivo en el canal
  - `false`: El peer ya está conectado
- `clientInfo` (object | null): OPCIONAL - Metadata del cliente (si lo envió en parámetros de conexión)

**Estructura de clientInfo** (sugerida):
```typescript
interface ClientInfo {
  platform?: string;        // e.g., "linux", "windows", "macos", "android"
  clientVersion?: string;   // Versión del cliente (e.g., "1.0.0")
  [key: string]: any;       // Campos adicionales permitidos
}
```

**Ejemplo**:
```json
{
  "header": {
    "type": "connected",
    "id": "server-gen-uuid",
    "timestamp": "2025-12-23T10:30:00.000Z"
  },
  "payload": {
    "deviceName": "laptop-work",
    "channelId": "abc12345",
    "waitingForPeer": true,
    "clientInfo": {
      "platform": "linux",
      "clientVersion": "1.0.0"
    }
  }
}
```

---

#### 4.3.2 PEER_EVENT Message (Servidor → Cliente)

**Propósito**: Notificar eventos relacionados con el peer (unión o salida del canal).

**Estructura**:
```typescript
{
  "header": {
    "type": "peer_event",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "peerName": string,          // REQUERIDO - Nombre del peer
    "event": "joined" | "left",  // REQUERIDO - Tipo de evento
    "clientInfo": object | null, // OPCIONAL - Info del peer (solo en "joined")
    "detail": string | null      // OPCIONAL - Información adicional
  }
}
```

**Campos Payload**:
- `peerName` (string): REQUERIDO - Nombre del peer
- `event` (enum): REQUERIDO
  - `"joined"`: El peer se unió al canal
  - `"left"`: El peer salió del canal
- `clientInfo` (object | null): OPCIONAL - Información del peer (generalmente solo presente cuando `event: "joined"`)
- `detail` (string | null): OPCIONAL - Información adicional sobre el evento (ej: razón de desconexión en "left")

**Ejemplo - Peer joined**:
```json
{
  "header": {
    "type": "peer_event",
    "id": "server-gen-uuid",
    "timestamp": "2025-12-23T10:31:00.000Z"
  },
  "payload": {
    "peerName": "phone-android",
    "event": "joined",
    "clientInfo": {
      "platform": "android",
      "clientVersion": "1.0.0"
    },
    "detail": null
  }
}
```

**Ejemplo - Peer left**:
```json
{
  "header": {
    "type": "peer_event",
    "id": "server-gen-uuid",
    "timestamp": "2025-12-23T10:35:00.000Z"
  },
  "payload": {
    "peerName": "phone-android",
    "event": "left",
    "clientInfo": null,
    "detail": "connection_closed"
  }
}
```

**Nota**: Cuando el segundo dispositivo se conecta, ambos clientes reciben un mensaje `peer_event` con `event: "joined"`.

---

#### 4.3.3 ERROR Message (Servidor → Cliente)

**Propósito**: Notificar errores de validación o estado.

**Estructura**:
```typescript
{
  "header": {
    "type": "error",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "code": ErrorCode,        // REQUERIDO - Código de error
    "message": string,        // REQUERIDO - Mensaje descriptivo
    "messageId": string | null, // OPCIONAL - ID del mensaje que causó el error
    "details": object | null  // OPCIONAL - Información adicional
  }
}
```

**Códigos de Error**:

El protocolo utiliza códigos de error estilo HTTP para distinguir entre errores recuperables y fatales:

**4xxx - Errores Recuperables** (la conexión permanece abierta):
```typescript
| "INVALID_MESSAGE"        // 4006 - Formato de mensaje inválido
| "MESSAGE_TOO_LARGE"      // 4007 - Mensaje excede límite de tamaño
| "NO_PEER_CONNECTED"      // 4008 - No hay peer conectado para recibir
```

**5xxx - Errores Fatales** (servidor cierra la conexión después de notificar):
```typescript
| "INVALID_SECRET"          // 5001 - Secreto incorrecto
| "INVALID_CHANNEL"         // 5002 - Formato de canal inválido
| "INVALID_DEVICE_NAME"     // 5003 - Nombre de dispositivo inválido
| "CHANNEL_FULL"            // 5004 - Canal tiene 2 dispositivos
| "DUPLICATE_DEVICE_NAME"   // 5005 - Nombre duplicado en canal
| "RATE_LIMIT_EXCEEDED"     // 5009 - Límite de tasa excedido
| "AUTH_TIMEOUT"            // 5010 - Timeout de autenticación
| "MAX_CHANNELS_REACHED"    // 5011 - Límite de canales alcanzado
```

**Comportamiento de Cierre**:
- Errores **4xxx**: Conexión permanece abierta, cliente puede continuar
- Errores **5xxx**: Servidor cierra la conexión después de enviar el mensaje de error

**Ejemplo**:
```json
{
  "header": {
    "type": "error",
    "id": "server-gen-uuid",
    "timestamp": "2025-12-23T10:32:00.000Z"
  },
  "payload": {
    "code": "MESSAGE_TOO_LARGE",
    "message": "Message size 110000000 exceeds maximum 104857600 bytes",
    "messageId": "f47ac10b-...",
    "details": {
      "maxSize": 104857600,
      "actualSize": 110000000
    }
  }
}
```

---

#### 4.3.4 SHUTDOWN Message (Servidor → Cliente)

**Propósito**: Notificar que el servidor se está apagando.

**Estructura**:
```typescript
{
  "header": {
    "type": "shutdown",
    "id": "uuid",
    "timestamp": "ISO-8601"
  },
  "payload": {
    "message": string,        // REQUERIDO - Mensaje de despedida
    "gracePeriod": number     // OPCIONAL - Segundos hasta cierre forzado
  }
}
```

**Ejemplo**:
```json
{
  "header": {
    "type": "shutdown",
    "id": "server-gen-uuid",
    "timestamp": "2025-12-23T10:40:00.000Z"
  },
  "payload": {
    "message": "Server is shutting down for maintenance",
    "gracePeriod": 5
  }
}
```

---

## 5. Flujo de Comunicación

### 5.1 Establecimiento de Conexión

```
1. Cliente → Servidor: WebSocket Upgrade
   URL: ws://host:port/ws?channel=abc12345&deviceName=laptop

2. Servidor → Cliente: (Conexión aceptada, inicia auth timeout)

3. Cliente → Servidor: AUTH message
   {
     "header": { "type": "auth", ... },
     "payload": { "secret": "..." }
   }

4. Servidor → Cliente: CONNECTED message
   {
     "header": { "type": "connected", ... },
     "payload": { "waitingForPeer": true, ... }
   }
```

### 5.2 Segundo Cliente se Une

```
5. Cliente B → Servidor: AUTH message (mismo proceso)

6. Servidor → Cliente A: PEER_EVENT message
   {
     "header": { "type": "peer_event", ... },
     "payload": { "peerName": "phone", "event": "joined", ... }
   }

7. Servidor → Cliente B: PEER_EVENT message
   {
     "header": { "type": "peer_event", ... },
     "payload": { "peerName": "laptop", "event": "joined", ... }
   }
```

### 5.3 Intercambio de Datos con ACK

```
8. Cliente A → Servidor: DATA message
   {
     "header": { "type": "data", "id": "msg-123", ... },
     "payload": { "contentType": "text", "data": "Hello", ... }
   }

9. Servidor → Cliente B: (Relay del DATA message sin modificar)

10. Cliente B → Servidor: ACK message
    {
      "header": { "type": "ack", "id": "ack-456", ... },
      "payload": { "ackFor": "msg-123", "status": "success", ... }
    }

11. Servidor → Cliente A: (Relay del ACK message)
```

### 5.4 Comando de Control

```
12. Cliente A → Servidor: CONTROL message
    {
      "header": { "type": "control", "id": "ctrl-789", ... },
      "payload": { "command": "ping", "params": null }
    }

13. Servidor → Cliente B: (Relay del CONTROL message)

14. Cliente B → Servidor: CONTROL message (respuesta)
    {
      "header": { "type": "control", "id": "ctrl-790", ... },
      "payload": { "command": "pong", "params": { "latency": 45 } }
    }

15. Servidor → Cliente A: (Relay de la respuesta)
```

### 5.5 Desconexión

```
16. Cliente B: Cierra conexión WebSocket

17. Servidor → Cliente A: PEER_EVENT message
    {
      "header": { "type": "peer_event", ... },
      "payload": { "peerName": "phone", "event": "left", ... }
    }
```

---

## 6. Validación y Reglas del Servidor

### 6.1 Estrategia de Validación por Capa

El servidor implementa validación en tres niveles:

#### Nivel 1: Header (ESTRICTO)
- **Todos** los campos del header son obligatorios
- Tipos deben coincidir exactamente con la especificación
- No se permiten campos adicionales en el header
- Cualquier violación resulta en error `INVALID_MESSAGE`

#### Nivel 2: Payload Estructura (SEMI-ESTRICTO)
- Campos principales definidos por el protocolo son validados
- Tipos y valores deben coincidir con especificación
- Ejemplo: `contentType` en DATA debe ser "text" o "binary"

#### Nivel 3: Payload Extensible (PASSTHROUGH)
- Objetos marcados como "flexible" (metadata, params, details) no son validados
- El servidor los relay tal cual sin inspeccionar contenido
- Responsabilidad del cliente validar semántica

### 6.2 Tabla de Validación por Tipo de Mensaje

| Tipo            | Header   | Payload Principal                     | Payload Extensible       |
|-----------------|----------|---------------------------------------|--------------------------|
| `auth`          | Estricto | Estricto (`secret`)                   | -                        |
| `control`       | Estricto | Semi-estricto (`command`)             | Passthrough (`params`)   |
| `data`          | Estricto | Semi-estricto (`contentType`, `data`) | Passthrough (`metadata`) |
| `ack`           | Estricto | Semi-estricto (`ackFor`, `status`)    | Passthrough (`details`)  |
| System messages | Estricto | Estricto (generado por servidor)      | Passthrough (opcionales) |

### 6.3 Manejo de Campos Desconocidos

```typescript
// En el nivel raíz del mensaje
{
  "header": { ... },      // Solo campos definidos
  "payload": { ... },     // Solo campos definidos + extensibles
  "unknownField": "..."   // IGNORADO (no causa error, se descarta)
}

// Dentro de áreas extensibles
{
  "payload": {
    "metadata": {
      "mimeType": "text/plain",     // Campo conocido
      "customField": "value",        // PERMITIDO (passthrough)
      "clientSpecific": { ... }      // PERMITIDO (passthrough)
    }
  }
}
```

### 6.4 Límites y Restricciones

| Límite                | Valor Default     | Configurable | Descripción                             |
|-----------------------|-------------------|--------------|-----------------------------------------|
| `MAX_MESSAGE_SIZE`    | 104857600 (100MB) | Sí           | Tamaño máximo del mensaje JSON completo |
| `MAX_CHANNELS`        | 4                 | Sí           | Número máximo de canales activos        |
| `DEVICES_PER_CHANNEL` | 2                 | No*          | Dispositivos por canal                  |
| `AUTH_TIMEOUT`        | 5000ms            | Sí           | Timeout para enviar AUTH message        |
| `IDLE_TIMEOUT`        | 60s               | Sí           | Timeout de inactividad                  |
| `RATE_LIMIT_MAX`      | 10                | Sí           | Conexiones máximas por IP en ventana    |
| `RATE_LIMIT_WINDOW`   | 60000ms           | Sí           | Ventana de tiempo para rate limit       |

*Nota: `DEVICES_PER_CHANNEL` está hardcoded en 2 por diseño del protocolo actual, pero la arquitectura debe permitir cambio futuro con mínimo esfuerzo.

---

## 7. Consideraciones de Implementación

### 7.1 Responsabilidades del Servidor

**El servidor DEBE**:
- Validar estructura de mensajes según nivel definido
- Verificar autenticación y autorización
- Gestionar canales y conexiones
- Relay mensajes entre partners
- Manejar errores y notificar clientes
- Implementar rate limiting y protección contra abuso
- Respetar límites de tamaño y conexiones

**El servidor NO DEBE**:
- Modificar contenido de payload en mensajes de datos/control
- Interpretar semántica de metadata, params o details
- Implementar compresión, encriptación o transformación de datos
- Mantener estado de sincronización de aplicación
- Persistir mensajes (relay en tiempo real únicamente)
- Procesar o validar contenido de campos extensibles

### 7.2 Responsabilidades del Cliente

**El cliente DEBE**:
- Generar IDs únicos (UUID v4) para cada mensaje
- Implementar lógica de reintentos y reconexión
- Validar semántica de mensajes recibidos
- Manejar compresión/descompresión si usa metadata.compressed
- Implementar timeout para ACKs si requiere confirmaciones
- Respetar límite de tamaño de mensajes antes de enviar

**El cliente PUEDE**:
- Implementar deduplicación usando message.id
- Comprimir datos antes de enviar (indicar en metadata)
- Calcular hash de contenido para verificación
- Definir campos personalizados en áreas extensibles
- Ignorar ACKs si no requiere confirmaciones
- Implementar comandos de control personalizados

### 7.3 Garantías del Protocolo

**WebSocket/TCP garantiza**:
- Entrega ordenada de mensajes
- Sin duplicación de mensajes
- Detección de conexiones rotas

**CRSP garantiza**:
- Estructura consistente de mensajes
- Identificación única de mensajes (via ID)
- Relay transparente de payloads extensibles
- Notificación de eventos de canal (join/leave)

**CRSP NO garantiza**:
- Entrega de mensajes (si peer desconectado)
- Persistencia de mensajes
- Confirmación de recepción (depende de ACKs opcionales)
- Orden entre canales distintos

---

## 8. Estructura del Proyecto

### 8.1 Organización Modular

```
apps/relay/
├── src/
│   ├── protocol/                    # Módulo del protocolo CRSP
│   │   ├── types/
│   │   │   ├── messages.ts          # Definiciones de tipos de mensajes
│   │   │   ├── enums.ts             # Enums (MessageType, ErrorCode, etc.)
│   │   │   └── index.ts
│   │   │
│   │   ├── validation/
│   │   │   ├── header.ts            # Validación de headers
│   │   │   ├── payload.ts           # Validación de payloads
│   │   │   ├── schemas.ts           # Schemas Zod del protocolo
│   │   │   └── index.ts
│   │   │
│   │   ├── messages/
│   │   │   ├── constructors.ts      # Constructores de mensajes del sistema
│   │   │   ├── serialization.ts     # Serialización/deserialización
│   │   │   └── index.ts
│   │   │
│   │   ├── constants.ts             # Constantes del protocolo
│   │   └── index.ts                 # Export público del protocolo
│   │
│   ├── server/                      # Implementación del servidor relay
│   │   ├── websocket/
│   │   │   ├── handler.ts           # Handlers WebSocket (open, message, close)
│   │   │   ├── upgrade.ts           # Lógica de upgrade de conexión
│   │   │   └── index.ts
│   │   │
│   │   ├── channel/
│   │   │   ├── manager.ts           # Gestión de canales
│   │   │   ├── device.ts            # Gestión de dispositivos en canal
│   │   │   └── index.ts
│   │   │
│   │   ├── security/
│   │   │   ├── rate-limiter.ts      # Rate limiting
│   │   │   └── index.ts
│   │   │
│   │   ├── http/
│   │   │   ├── routes.ts            # Endpoints HTTP (/health, /stats)
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts
│   │
│   ├── config/
│   │   ├── env.ts                   # Validación de variables de entorno
│   │   ├── logger.ts                # Configuración de Pino
│   │   └── index.ts
│   │
│   ├── utils/
│   │   └── index.ts
│   │
│   ├── index.ts                     # Entry point
│   └── server.ts                    # Configuración del servidor Bun
│
├── protocol-spec/                   # Especificación del protocolo
│   ├── PROTOCOL.md                  # Este documento
│   ├── MESSAGES.md                  # Referencia rápida de mensajes
│   └── EXAMPLES.md                  # Ejemplos de uso
│
├── tests/
│   ├── protocol/                    # Tests del protocolo
│   └── server/                      # Tests del servidor
│
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### 8.2 Separación de Responsabilidades

#### Módulo `protocol/`
- **Propósito**: Definición independiente del protocolo CRSP
- **Sin dependencias**: No debe importar nada de `server/` o `config/`
- **Portable**: Puede extraerse a librería `@wsclip/crsp-protocol`
- **Contiene**: Tipos, validación, construcción de mensajes, constantes

#### Módulo `server/`
- **Propósito**: Implementación específica usando Bun WebSocket
- **Dependencias**: Puede importar de `protocol/` y `config/`
- **Específico**: Lógica de servidor relay, gestión de canales, networking

#### Módulo `config/`
- **Propósito**: Configuración del runtime y entorno
- **Independiente**: No depende de `protocol/` ni `server/`

### 8.3 Exports Públicos del Protocolo

El módulo `protocol/` debe exportar una API limpia para uso externo:

```typescript
// protocol/index.ts - API pública
export * from './types';
export * from './validation';
export * from './messages';
export * from './constants';

// Ejemplo de uso externo (en un cliente)
import { 
  MessageType, 
  ErrorCode,
  validateMessage,
  createDataMessage 
} from '@wsclip/crsp-protocol';
```

---

## 9. Extensibilidad del Protocolo

### 9.1 Cómo Extender el Protocolo

Los clientes pueden extender el protocolo de tres formas:

#### 1. Campos Personalizados en Metadata
```json
{
  "payload": {
    "contentType": "binary",
    "data": "...",
    "metadata": {
      "mimeType": "application/pdf",
      "size": 123456,
      // Campos personalizados
      "customApp": {
        "version": "2.0",
        "featureFlags": ["compress", "encrypt"]
      }
    }
  }
}
```

#### 2. Comandos Personalizados en Control Messages
```json
{
  "header": { "type": "control", ... },
  "payload": {
    "command": "my_custom_command",
    "params": {
      "action": "start",
      "config": { ... }
    }
  }
}
```

#### 3. Detalles Personalizados en ACK
```json
{
  "header": { "type": "ack", ... },
  "payload": {
    "ackFor": "msg-id",
    "status": "success",
    "details": {
      "processingTime": 120,
      "savedTo": "/path/to/file",
      "customMetric": 42
    }
  }
}
```

### 9.2 Buenas Prácticas de Extensión

1. **Namespacing**: Usar prefijos para evitar colisiones
   ```json
   "metadata": {
     "myapp:feature": "value",
     "myapp:config": { ... }
   }
   ```

2. **Versionado de Campos**: Incluir versión si la estructura puede evolucionar
   ```json
   "metadata": {
     "customData": {
       "version": "1.0",
       "payload": { ... }
     }
   }
   ```

3. **Documentación**: Documentar campos personalizados para futuros desarrolladores

4. **Validación en Cliente**: El cliente receptor debe validar campos personalizados

5. **Graceful Degradation**: Manejar ausencia de campos personalizados elegantemente

---

## 10. Consideraciones de Seguridad

### 10.1 Autenticación
- Secreto compartido enviado en mensaje AUTH (no en URL)
- Timeout de autenticación (5s) para prevenir conexiones sin autenticar
- Rate limiting por IP para prevenir ataques de fuerza bruta

### 10.2 Validación de Entrada
- Validación estricta de headers para prevenir inyección
- Límite de tamaño de mensaje para prevenir DoS
- Validación de UUIDs para prevenir inyección en logs

### 10.3 Aislamiento de Canales
- Canales identificados por ID de 8 caracteres alfanuméricos (62^8 combinaciones)
- Sin listado de canales activos (previene enumeración)
- Desconexión automática si se intenta unir a canal lleno

### 10.4 Límites y Throttling
- Rate limiting configurable
- Límite de canales activos simultáneos
- Timeout de inactividad
- Límite de tamaño de mensaje

### 10.5 Recomendaciones de Producción
- Usar WSS (WebSocket Secure) con TLS
- Implementar secretos robustos (mínimo 32 caracteres aleatorios)
- Rotar secretos periódicamente
- Monitorear patrones de abuso
- Logs estructurados para auditoría
- Configurar límites de tamaño de mensaje apropiados para el caso de uso
- Habilitar compresión WebSocket (`permessage-deflate`) deshabilitada por defecto

---

## 11. Conclusión

Este documento define CRSP (Content Relay Sync Protocol) v1.0, un protocolo estructurado pero flexible para sincronización de contenido sobre WebSocket. El diseño equilibra:

- **Estructura**: Suficiente para garantizar interoperabilidad entre clientes
- **Flexibilidad**: Áreas extensibles para casos de uso específicos
- **Simplicidad**: Solo lo esencial, sin sobre-ingeniería
- **Modularidad**: Protocolo separable de implementación del servidor

### 11.1 Características Principales

1. **Estructura jerárquica**: Header estricto + Payload flexible
2. **Identificación única**: Campo ID obligatorio en todos los mensajes
3. **Tipos genéricos**: `data` y `control` en vez de tipos específicos
4. **Validación en tres niveles**: Estricto, semi-estricto y passthrough
5. **Códigos de error HTTP-style**: 4xxx recuperables, 5xxx fatales
6. **Peer-to-peer mediado**: Servidor stateless relay
7. **Extensibilidad controlada**: Áreas definidas para campos personalizados

### 11.2 Decisiones de Diseño

- **Sin versionado**: Los clientes se actualizan a la última versión (uso interno)
- **Límite de 2 peers por canal**: Hardcoded pero con diseño extensible
- **Compresión WebSocket deshabilitada**: Por defecto, configurable
- **Logging ligero**: Solo headers y metadata básica, sin payload completo
- **Terminología peer**: En vez de "partner" para consistencia con networking

### 11.3 Próximos Pasos

1. Revisar y aprobar esta especificación
2. Crear documentos complementarios:
   - `MESSAGES.md` - Referencia rápida de mensajes
   - `EXAMPLES.md` - Ejemplos de uso detallados
3. Implementar el protocolo según la estructura definida en Sección 8
4. Crear suite de pruebas para validar conformidad

---

**Documento generado**: 2025-12-23  
**Versión del protocolo**: 1.0  
**Estado**: Propuesta para revisión
