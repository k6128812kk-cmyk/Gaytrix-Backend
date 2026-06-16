# ============================================================
# FIX RAILWAY REMOTE — run this from inside gaytrix-backend\
# PowerShell version
# ============================================================

Write-Host "→ Step 1: Ensure .gitignore excludes node_modules..." -ForegroundColor Cyan
$gitignore = Get-Content .gitignore -ErrorAction SilentlyContinue
if ($gitignore -notcontains "node_modules") {
    Add-Content .gitignore "`nnode_modules"
}
if ($gitignore -notcontains "dist") {
    Add-Content .gitignore "`ndist"
}

Write-Host "→ Step 2: Remove node_modules and dist from git tracking..." -ForegroundColor Cyan
git rm -r --cached node_modules 2>$null
git rm -r --cached dist 2>$null

Write-Host "→ Step 3: Stage all source files..." -ForegroundColor Cyan
git add .gitignore
git add package.json
git add package-lock.json
git add tsconfig.json
git add railway.toml
git add src/

Write-Host "→ Step 4: Commit the clean state..." -ForegroundColor Cyan
git commit -m "fix: restore source files, remove node_modules from git"

Write-Host "→ Step 5: Push to GitHub..." -ForegroundColor Cyan
git push origin HEAD

Write-Host ""
Write-Host "✅ Done. Railway will now redeploy from the clean source." -ForegroundColor Green
