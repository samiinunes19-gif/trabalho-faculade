$port = 8123
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "serving on http://localhost:$port"
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="application/javascript; charset=utf-8"; ".css"="text/css"; ".png"="image/png"; ".webp"="image/webp"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml"; ".json"="application/json" }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
  if ($path -eq "/") { $path = "/index.html" }
  if ($path -eq "/administracao-dosclientes") { $path = "/administracao-dosclientes.html" }
  $file = Join-Path $root ($path.TrimStart("/").Replace("/","\"))
  try {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    # Fallback SPA: caminho sem extensao e sem arquivo -> serve index.html (ex.: /cervejas)
    if (-not (Test-Path $file -PathType Leaf) -and $ext -eq "" -and -not $path.StartsWith("/api")) {
      $file = Join-Path $root "index.html"; $ext = ".html"
    }
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {}
  $ctx.Response.OutputStream.Close()
}
