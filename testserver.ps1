# Kleiner Webserver zum Testen der Vereinskasse auf diesem PC.
# Aufruf: powershell -ExecutionPolicy Bypass -File testserver.ps1
# Danach im Browser: http://localhost:8123/
param([int]$Port = 8123)

$root = $PSScriptRoot
$typen = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.json' = 'application/json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Vereinskasse: http://localhost:$Port/  (Beenden mit Strg+C)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $pfad = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($pfad -eq '') { $pfad = 'index.html' }
    $datei = [IO.Path]::GetFullPath((Join-Path $root $pfad))
    if (-not $datei.StartsWith($root) -or -not (Test-Path -LiteralPath $datei -PathType Leaf)) {
      $ctx.Response.StatusCode = 404
    } else {
      $bytes = [IO.File]::ReadAllBytes($datei)
      $typ = $typen[[IO.Path]::GetExtension($datei)]
      if ($typ) { $ctx.Response.ContentType = $typ }
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
