# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# WebRTC
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Socket.IO
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# react-native-webrtc
-keep class com.oney.WebRTCModule.** { *; }

# react-native-keychain
-keep class com.oblador.keychain.** { *; }

# Noise (if using noise-java)
-keep class com.southernstorm.noise.** { *; }
-dontwarn com.southernstorm.noise.**
