package com.eliaszwc.livolog

import android.annotation.SuppressLint
import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * 把未捕获异常写到私有目录，下次启动时读出来直接显示在屏幕上。
 *
 * 这样在没有 adb、也拿不到 logcat 的情况下，用户截个图就能定位崩溃原因。
 */
object CrashLog {

    private const val FILE_NAME = "last-crash.txt"

    private fun file(context: Context) = File(context.filesDir, FILE_NAME)

    @SuppressLint("ApplySharedPref")
    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                file(appContext).writeText(describe(appContext, thread, throwable))
            } catch (_: Throwable) {
                // 记录本身失败也不能再抛异常出来
            }
            previous?.uncaughtException(thread, throwable)
        }
    }

    /** 读取并清除上次的崩溃记录；没有则返回 null */
    fun readAndClear(context: Context): String? {
        val target = file(context)
        if (!target.exists()) {
            return null
        }
        return try {
            val text = target.readText()
            target.delete()
            text
        } catch (_: Throwable) {
            null
        }
    }

    private fun describe(context: Context, thread: Thread, throwable: Throwable): String {
        val writer = StringWriter()
        throwable.printStackTrace(PrintWriter(writer))

        val version = try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            "${info.versionName}"
        } catch (_: Throwable) {
            "?"
        }

        return buildString {
            append("Thread: ").append(thread.name).append('\n')
            append("Device: ").append(android.os.Build.MANUFACTURER)
                .append(' ').append(android.os.Build.MODEL).append('\n')
            append("Android: ").append(android.os.Build.VERSION.RELEASE)
                .append(" (API ").append(android.os.Build.VERSION.SDK_INT).append(")\n")
            append("Version: ").append(version).append('\n')
            append('\n')
            append(writer.toString())
        }
    }
}
