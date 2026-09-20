package com.eliaszwc.lifelog

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * 时间记录的 CSV 落盘。
 *
 * - API 29+ 优先走 MediaStore，落在公共的 `Documents/LifeLog/` 下：不需要任何权限，
 *   文件管理器里看得见。部分定制系统（如 OPPO）会限制 MediaStore.Files，
 *   失败则退回到应用专属外部目录，并把**实际路径**返回给网页显示。
 * - API < 29 直接写公共目录，需要 WRITE_EXTERNAL_STORAGE（manifest 里限了 maxSdkVersion=28）。
 */
object CsvStore {

    const val FILE_NAME = "records.csv"
    private const val DIR_NAME = "LifeLog"
    /** 设置页「导出数据」用同一个 MIME 拉起系统「另存为」 */
    const val MIME = "text/csv"

    /** 写成功时返回实际文件路径 */
    fun write(context: Context, content: String): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return try {
                writeViaMediaStore(context, content)
            } catch (_: Throwable) {
                writeViaAppDir(context, content)
            }
        }
        return writeViaPublicDir(content)
    }

    /** 读不到就返回 null（首次运行时文件还不存在属于正常情况） */
    fun read(context: Context): String? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            readViaMediaStore(context) ?: readViaFile(appFile(context))
        } else {
            readViaFile(publicFile())
        }
    } catch (_: Throwable) {
        null
    }

    /** 给网页显示的落盘位置（优先报实际存在的那份） */
    fun describe(context: Context): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (findInMediaStore(context) != null) {
                return "${relativePath()}/$FILE_NAME"
            }
            val fallback = appFile(context)
            if (fallback.exists()) {
                return fallback.absolutePath
            }
            return "${relativePath()}/$FILE_NAME"
        }
        return publicFile().absolutePath
    }

    // --- API 29+ ------------------------------------------------------------

    private fun collection(): Uri =
        MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    private fun relativePath(): String = "${Environment.DIRECTORY_DOCUMENTS}/$DIR_NAME"

    private fun findInMediaStore(context: Context): Uri? {
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND " +
            "${MediaStore.MediaColumns.RELATIVE_PATH}=?"
        val args = arrayOf(FILE_NAME, relativePath() + "/")

        context.contentResolver.query(
            collection(),
            arrayOf(MediaStore.MediaColumns._ID),
            selection,
            args,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                return ContentUris.withAppendedId(collection(), cursor.getLong(0))
            }
        }
        return null
    }

    private fun writeViaMediaStore(context: Context, content: String): String {
        val resolver = context.contentResolver
        val existing = findInMediaStore(context)

        val uri = existing ?: run {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, FILE_NAME)
                put(MediaStore.MediaColumns.MIME_TYPE, MIME)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath())
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            resolver.insert(collection(), values) ?: error("MediaStore 无法创建 $FILE_NAME")
        }

        resolver.openOutputStream(uri, "wt")?.use {
            it.write(content.toByteArray(Charsets.UTF_8))
        } ?: error("MediaStore 无法写入 $FILE_NAME")

        if (existing == null) {
            resolver.update(
                uri,
                ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
                null,
                null,
            )
        }

        return "${relativePath()}/$FILE_NAME"
    }

    private fun readViaMediaStore(context: Context): String? {
        val uri = findInMediaStore(context) ?: return null
        return context.contentResolver.openInputStream(uri)?.use {
            it.readBytes().toString(Charsets.UTF_8)
        }
    }

    // --- 退路 ---------------------------------------------------------------

    private fun appFile(context: Context): File =
        File(context.getExternalFilesDir(null), "$DIR_NAME/$FILE_NAME")

    private fun writeViaAppDir(context: Context, content: String): String {
        val file = appFile(context)
        file.parentFile?.mkdirs()
        file.writeText(content, Charsets.UTF_8)
        return file.absolutePath
    }

    @Suppress("DEPRECATION")
    private fun publicFile(): File = File(
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
        "$DIR_NAME/$FILE_NAME",
    )

    private fun writeViaPublicDir(content: String): String {
        val file = publicFile()
        file.parentFile?.mkdirs()
        file.writeText(content, Charsets.UTF_8)
        return file.absolutePath
    }

    private fun readViaFile(file: File): String? =
        if (file.exists()) file.readText(Charsets.UTF_8) else null
}
