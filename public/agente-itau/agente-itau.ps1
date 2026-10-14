# Agente FCT: manda para o Sistema FCT (Conciliação) os arquivos de retorno de DDA que o Itaú Mailbox baixa nesta máquina.
# Roda sozinho pelo Agendador de Tarefas (instale com instalar.ps1). Nunca apaga nem altera os arquivos da pasta.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logF = Join-Path $dir 'agente.log'
function Log($m) {
  if ((Test-Path $logF) -and (Get-Item $logF).Length -gt 1MB) { Move-Item $logF ($logF + '.antigo') -Force }
  Add-Content -Path $logF -Value ((Get-Date -Format 'dd/MM/yyyy HH:mm:ss') + '  ' + $m) -Encoding UTF8
}
# uma execução por vez
$trava = Join-Path $dir 'agente.lock'
try { $fsTrava = [IO.File]::Open($trava, 'OpenOrCreate', 'ReadWrite', 'None') } catch { exit 0 }
try {
  $cfg = Get-Content (Join-Path $dir 'config.json') -Raw | ConvertFrom-Json
  $sec = $cfg.token | ConvertTo-SecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if (-not (Test-Path $cfg.pasta)) { Log "ERRO: pasta não encontrada: $($cfg.pasta)"; exit 1 }

  $estF = Join-Path $dir 'enviados.json'
  $est = @{}
  if (Test-Path $estF) { (Get-Content $estF -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $est[$_.Name] = $_.Value } }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.Net.Http
  $cli = New-Object System.Net.Http.HttpClient
  $cli.Timeout = [TimeSpan]::FromSeconds(120)
  $cli.DefaultRequestHeaders.Add('X-Agente', $token)
  $url = $cfg.url.TrimEnd('/') + '/api/conciliacao/agente'

  $limite = (Get-Date).AddDays(-[int]$cfg.diasParaTras)
  $arqs = Get-ChildItem -Path $cfg.pasta -Recurse -File | Where-Object { $_.Length -gt 0 -and $_.Length -lt 4MB -and $_.LastWriteTime -ge $limite } | Sort-Object LastWriteTime
  $novos = 0; $falhas = 0
  foreach ($a in $arqs) {
    $h = (Get-FileHash -Path $a.FullName -Algorithm SHA256).Hash
    if ($est.ContainsKey($h)) { continue }
    # só manda o que parece retorno do Itaú (começa com "341"); o resto fica marcado como ignorado aqui mesmo
    $ini = New-Object byte[] 3; $fs = [IO.File]::OpenRead($a.FullName); $null = $fs.Read($ini, 0, 3); $fs.Close()
    if ([Text.Encoding]::ASCII.GetString($ini) -ne '341') { $est[$h] = @{ nome = $a.Name; quando = (Get-Date -Format 's'); resultado = 'ignorado (não é arquivo do Itaú)' }; continue }
    try {
      $bytes = [IO.File]::ReadAllBytes($a.FullName)
      $form = New-Object System.Net.Http.MultipartFormDataContent
      $conteudo = New-Object System.Net.Http.ByteArrayContent(,$bytes)
      $form.Add($conteudo, 'arquivo', $a.Name)
      $r = $cli.PostAsync($url, $form).Result
      $txt = $r.Content.ReadAsStringAsync().Result
      if ([int]$r.StatusCode -eq 401) { Log "ERRO: chave do agente recusada (revogada ou errada). Parei."; break }
      if ([int]$r.StatusCode -eq 503) { Log "ERRO: o servidor ainda não está com o agente habilitado. Tento de novo depois."; break }
      if (-not $r.IsSuccessStatusCode) { $falhas++; Log "FALHA $($a.Name): HTTP $([int]$r.StatusCode) $txt"; continue }
      $j = $txt | ConvertFrom-Json
      $res = if ($j.ignorado) { 'ignorado: ' + $j.motivo } elseif ($j.repetido) { 'já estava no sistema' } else { "enviado ($($j.mensagem))" }
      $est[$h] = @{ nome = $a.Name; quando = (Get-Date -Format 's'); resultado = $res }
      $novos++
      Log "$($a.Name): $res"
    } catch { $falhas++; Log "FALHA $($a.Name): $($_.Exception.Message)" }
  }
  ($est | ConvertTo-Json -Depth 3) | Set-Content -Path $estF -Encoding UTF8
  if ($novos -or $falhas) { Log "fim: $novos arquivo(s) processado(s), $falhas falha(s)" }
} catch { Log "ERRO: $($_.Exception.Message)" }
finally { $fsTrava.Close() }
