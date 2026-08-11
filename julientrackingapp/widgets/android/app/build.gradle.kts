plugins {
    id("com.android.application")
}

android {
    namespace = "ch.fittrack.widgets"
    compileSdk = 36

    defaultConfig {
        applicationId = "ch.fittrack.widgets"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
