#!/bin/sh
# Builds PhotoVault.apk without Gradle. Needs JDK 17+ and Android SDK (platform 34, build-tools 35).
set -e
SDK=${ANDROID_HOME:?set ANDROID_HOME}; BT=$SDK/build-tools/35.0.0; JAR=$SDK/platforms/android-34/android.jar
rm -rf build && mkdir -p build/c build/gen build/obj build/dex
$BT/aapt2 compile --dir res -o build/c/res.zip
$BT/aapt2 link -o build/base.apk -I $JAR --manifest AndroidManifest.xml --java build/gen build/c/res.zip
javac --release 8 -encoding UTF-8 -classpath $JAR -d build/obj $(find src build/gen -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output build/dex $(find build/obj -name '*.class')
cp build/base.apk build/unsigned.apk && (cd build/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -f -p 4 build/unsigned.apk build/aligned.apk
$BT/apksigner sign --ks photovault-release.jks --ks-pass pass:PhotoVault2026 --ks-key-alias photovault --out PhotoVault.apk build/aligned.apk
echo "Built PhotoVault.apk"
