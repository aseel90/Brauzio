from pathlib import Path
import json

shot = Path('app/chrome-extension/entrypoints/background/tools/browser/screenshot.ts')
s = shot.read_text()
old = """      if (returnImage === true || storeBase64 === true) {\n        const compressed = await compressImage(finalImageDataUrl, {\n          scale: fullPage ? 0.7 : 0.85,\n          quality: 0.82,\n          format: 'image/jpeg',\n        });\n        const base64Data = compressed.dataUrl.replace(/^data:image\\/[^;]+;base64,/, '');\n        if (returnImage === true) responseImage = { data: base64Data, mimeType: compressed.mimeType };\n        if (storeBase64 === true) {\n          results.base64 = base64Data;\n          results.base64MimeType = compressed.mimeType;\n        }\n      }\n"""
new = """      if (returnImage === true || storeBase64 === true) {\n        let imageDataUrl = finalImageDataUrl;\n        let imageMimeType = 'image/png';\n        let compressionFallback = false;\n\n        try {\n          const compressed = await compressImage(finalImageDataUrl, {\n            scale: fullPage ? 0.7 : 0.85,\n            quality: 0.82,\n            format: 'image/jpeg',\n          });\n          imageDataUrl = compressed.dataUrl;\n          imageMimeType = compressed.mimeType;\n        } catch (compressionError) {\n          compressionFallback = true;\n          imageMimeType = finalImageDataUrl.startsWith('data:image/jpeg')\n            ? 'image/jpeg'\n            : 'image/png';\n          console.warn(\n            `[Screenshot Tool] Compression failed; returning captured ${imageMimeType} directly`,\n            compressionError,\n          );\n        }\n\n        const base64Data = imageDataUrl.replace(/^data:image\\/[^;]+;base64,/, '');\n        if (returnImage === true) responseImage = { data: base64Data, mimeType: imageMimeType };\n        if (storeBase64 === true) {\n          results.base64 = base64Data;\n          results.base64MimeType = imageMimeType;\n        }\n        if (compressionFallback) results.compressionFallback = true;\n      }\n"""
if old in s:
    shot.write_text(s.replace(old, new))
elif 'compressionFallback = false' not in s:
    raise SystemExit('screenshot hotfix target not found')

pkg = Path('app/chrome-extension/package.json')
data = json.loads(pkg.read_text())
data['version'] = '3.0.2'
pkg.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('Brauzio Chrome hotfix prepared:', data['version'])
