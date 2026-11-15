param(
  [int]$Port = 8080
)

$Root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

Write-Host "ORBITAL KITCHEN server running at http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

$MimeTypes = @{
  ".html"  = "text/html; charset=utf-8"
  ".css"   = "text/css; charset=utf-8"
  ".js"    = "application/javascript; charset=utf-8"
  ".json"  = "application/json; charset=utf-8"
  ".svg"   = "image/svg+xml"
  ".png"   = "image/png"
  ".jpg"   = "image/jpeg"
  ".jpeg"  = "image/jpeg"
  ".webp"  = "image/webp"
  ".woff2" = "font/woff2"
  ".ttf"   = "font/ttf"
  ".mp3"   = "audio/mpeg"
  ".wav"   = "audio/wav"
}

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $DecodedPath = [Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($DecodedPath)) { $DecodedPath = "index.html" }
    $SafeRel = $DecodedPath.Replace('/', '\')
    $Candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $SafeRel))

    if ($Candidate.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $Candidate -PathType Leaf)) {
      $Ext = [System.IO.Path]::GetExtension($Candidate).ToLowerInvariant()
      $Context.Response.ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
      $Context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
      $Context.Response.Headers["Pragma"] = "no-cache"
      $Context.Response.Headers["Expires"] = "0"
      $Bytes = [System.IO.File]::ReadAllBytes($Candidate)
      $Context.Response.ContentLength64 = $Bytes.Length
      $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    } else {
      $Context.Response.StatusCode = 404
      $Msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $Context.Response.OutputStream.Write($Msg, 0, $Msg.Length)
    }
    $Context.Response.OutputStream.Close()
  }
} finally {
  $Listener.Stop()
}
