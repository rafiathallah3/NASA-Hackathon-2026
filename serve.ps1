param(
  [int]$Port = 8080
)

$Root = $PSScriptRoot
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

Write-Host "ORBITAL KITCHEN server running at http://localhost:$Port/" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
}

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $RelPath = $Context.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($RelPath)) { $RelPath = "index.html" }
    $SafeRel = $RelPath -replace '\.\.', ''
    $FilePath = Join-Path $Root $SafeRel

    if (Test-Path $FilePath -PathType Leaf) {
      $Ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
      $Context.Response.ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
      $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
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
