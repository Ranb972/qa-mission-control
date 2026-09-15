# Local Windows OCR bridge. Fixed script; untrusted image/text is stdin data,
# never a command, path or argument. No temporary files or source logging.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.DataWriter, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
    $inputText = [Console]::In.ReadToEnd()
    if ($inputText.Length -gt 4300000) { throw 'limit' }
    $request = $inputText | ConvertFrom-Json
    $languages = @([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { $_.LanguageTag })
    if ($request.operation -eq 'capabilities') {
        @{ supported = ($languages.Count -gt 0); languages = $languages; maxDimension = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension } | ConvertTo-Json -Compress
        exit 0
    }
    if ($request.operation -ne 'recognize' -or $languages -notcontains $request.language) { throw 'unsupported' }
    $bytes = [Convert]::FromBase64String($request.png)
    if ($bytes.Length -gt 3145728 -or $bytes.Length -lt 24) { throw 'limit' }
    $awaitMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    function AwaitResult($operation, $resultType) {
        $task = $awaitMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
        if (-not $task.Wait(20000)) { throw 'timeout' }
        return $task.Result
    }
    $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $writer = New-Object Windows.Storage.Streams.DataWriter($stream)
    $writer.WriteBytes($bytes)
    $null = AwaitResult ($writer.StoreAsync()) ([uint32])
    $null = $writer.DetachStream()
    $stream.Seek(0)
    $decoder = AwaitResult ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    if ($decoder.PixelWidth -gt 2048 -or $decoder.PixelHeight -gt 2048) { throw 'limit' }
    $bitmap = AwaitResult ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $language = New-Object Windows.Globalization.Language($request.language)
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
    $result = AwaitResult ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $text = ($result.Lines | ForEach-Object { $_.Text }) -join "`n"
    if ($text.Length -gt 30000) { throw 'limit' }
    @{ text = $text; language = $engine.RecognizerLanguage.LanguageTag } | ConvertTo-Json -Compress
    $bitmap.Dispose()
    $stream.Dispose()
} catch {
    # Never emit native exception details: they may contain input or paths.
    [Console]::Out.Write('{"error":"local_ocr_unavailable"}')
    exit 1
}
