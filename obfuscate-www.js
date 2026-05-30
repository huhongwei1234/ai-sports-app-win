const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const wwwDir = path.join(__dirname, 'node_modules', '_internal', 'www');
const htmlFiles = fs.readdirSync(wwwDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const filePath = path.join(wwwDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 匹配 <script> 标签中的内容（非 src 引用的内联脚本）
    const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
    let match;
    let modified = false;

    while ((match = scriptRegex.exec(content)) !== null) {
        const originalScript = match[0];
        const jsCode = match[1].trim();
        if (!jsCode) continue;

        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, {
                compact: true,
                controlFlowFlattening: false,
                deadCodeInjection: false,
                debugProtection: false,
                debugProtectionInterval: 0,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'mangled',
                rotateStringArray: true,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                transformObjectKeys: false,
                unicodeEscapeSequence: false
            });

            const obfuscatedCode = obfuscated.getObfuscatedCode();
            const newScript = `<script>\n${obfuscatedCode}\n</script>`;
            content = content.replace(originalScript, newScript);
            modified = true;
            console.log(`[混淆] ${file}: 成功混淆 ${jsCode.length} 字符 → ${obfuscatedCode.length} 字符`);
        } catch (e) {
            console.error(`[混淆失败] ${file}:`, e.message);
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`[写入] ${file}`);
    } else {
        console.log(`[跳过] ${file}: 无内联脚本`);
    }
});

console.log('混淆完成！');
