[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,
    [Parameter(Mandatory = $true)]
    [string]$RenderDirectory
)

$ErrorActionPreference = 'Stop'
$presentation = $null
$powerPoint = $null

try {
    $resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
    New-Item -ItemType Directory -Path $RenderDirectory -ErrorAction Stop | Out-Null

    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.DisplayAlerts = 1
    $presentation = $powerPoint.Presentations.Open($resolvedInput, $true, $false, $false)

    $visibleText = New-Object Text.StringBuilder
    $notesText = New-Object Text.StringBuilder
    foreach ($slide in $presentation.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                [void]$visibleText.AppendLine($shape.TextFrame.TextRange.Text)
            }
        }
        foreach ($shape in $slide.NotesPage.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                [void]$notesText.AppendLine($shape.TextFrame.TextRange.Text)
            }
        }
    }

    $presentation.Export($RenderDirectory, 'PNG')
    $renderedSlides = @(Get-ChildItem -LiteralPath $RenderDirectory -Filter '*.PNG')

    [pscustomobject]@{
        powerPointVersion = $powerPoint.Version
        openedWithoutException = $true
        readOnly = [bool]$presentation.ReadOnly
        slides = $presentation.Slides.Count
        renderedPng = $renderedSlides.Count
        frenchTitle = $visibleText.ToString().Contains('Une formation lisible et réutilisable')
        frenchBody = $visibleText.ToString().Contains('Le support conserve les accents français')
        arabicTitle = $visibleText.ToString().Contains('تكوين واضح وقابل لإعادة الاستخدام')
        arabicBody = $visibleText.ToString().Contains('يحافظ العرض على النص العربي')
        frenchNotes = $notesText.ToString().Contains('Le support conserve les accents français')
        arabicNotes = $notesText.ToString().Contains('يحافظ العرض على النص العربي')
    } | ConvertTo-Json -Compress
}
finally {
    if ($presentation) {
        $presentation.Close()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation)
    }
    if ($powerPoint) {
        $powerPoint.Quit()
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
