package com.eliaszwc.lifelog

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
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

    /** 时间记录的数据库 */
    const val FILE_RECORDS = "records.csv"
    /** 跟踪数据的数据库，与 records.csv 同目录 */
    const val FILE_METRICS = "metrics.csv"

    private const val DIR_NAME = "LifeLog"
    /** 「导出数据」与文件夹里新建 CSV 都用它 */
    const val MIME = "text/csv"

    /** 用户在设置页自选的文件夹（SAF tree）；没选过就用默认位置 */
    private const val PREFS_NAME = "lifelog"
    private const val KEY_TREE_URI = "csv_tree_uri"

    /** 写成功时返回实际文件路径 */
    fun write(context: Context, content: String, fileName: String = FILE_RECORDS): String {
        // 用户自选的文件夹优先
        val tree = treeUri(context)
        if (tree != null) {
            return writeToTree(context, tree, fileName, content)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return try {
                writeViaMediaStore(context, content, fileName)
            } catch (_: Throwable) {
                writeViaAppDir(context, content, fileName)
            }
        }
        return writeViaPublicDir(content, fileName)
    }

    /** 读不到就返回 null（首次运行时文件还不存在属于正常情况） */
    fun read(context: Context, fileName: String = FILE_RECORDS): String? = try {
        val tree = treeUri(context)
        if (tree != null) {
            readFromTree(context, tree, fileName)
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            readViaMediaStore(context, fileName) ?: readViaFile(appFile(context, fileName))
        } else {
            readViaFile(publicFile(fileName))
        }
    } catch (_: Throwable) {
        null
    }

    /** 给网页显示的落盘位置（优先报实际存在的那份；自选文件夹时报那个文件夹） */
    fun describe(context: Context): String {
        describeTree(context)?.let { return it }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (findInMediaStore(context, FILE_RECORDS) != null) {
                return "${relativePath()}/$FILE_RECORDS"
            }
            val fallback = appFile(context, FILE_RECORDS)
            if (fallback.exists()) {
                return fallback.absolutePath
            }
            return "${relativePath()}/$FILE_RECORDS"
        }
        return publicFile(FILE_RECORDS).absolutePath
    }

    // --- API 29+ ------------------------------------------------------------

    private fun collection(): Uri =
        MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    private fun relativePath(): String = "${Environment.DIRECTORY_DOCUMENTS}/$DIR_NAME"

    private fun findInMediaStore(context: Context, fileName: String): Uri? {
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND " +
            "${MediaStore.MediaColumns.RELATIVE_PATH}=?"
        val args = arrayOf(fileName, relativePath() + "/")

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

    private fun writeViaMediaStore(context: Context, content: String, fileName: String): String {
        val resolver = context.contentResolver
        val existing = findInMediaStore(context, fileName)

        val uri = existing ?: run {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, MIME)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath())
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            resolver.insert(collection(), values) ?: error("MediaStore 无法创建 $fileName")
        }

        resolver.openOutputStream(uri, "wt")?.use {
            it.write(content.toByteArray(Charsets.UTF_8))
        } ?: error("MediaStore 无法写入 $fileName")

        if (existing == null) {
            resolver.update(
                uri,
                ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) },
                null,
                null,
            )
        }

        return "${relativePath()}/$fileName"
    }

    private fun readViaMediaStore(context: Context, fileName: String): String? {
        val uri = findInMediaStore(context, fileName) ?: return null
        return context.contentResolver.openInputStream(uri)?.use {
            it.readBytes().toString(Charsets.UTF_8)
        }
    }

    // --- 退路 ---------------------------------------------------------------

    private fun appFile(context: Context, fileName: String): File =
        File(context.getExternalFilesDir(null), "$DIR_NAME/$fileName")

    private fun writeViaAppDir(context: Context, content: String, fileName: String): String {
        val file = appFile(context, fileName)
        file.parentFile?.mkdirs()
        file.writeText(content, Charsets.UTF_8)
        return file.absolutePath
    }

    @Suppress("DEPRECATION")
    private fun publicFile(fileName: String): File = File(
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
        "$DIR_NAME/$fileName",
    )

    private fun writeViaPublicDir(content: String, fileName: String): String {
        val file = publicFile(fileName)
        file.parentFile?.mkdirs()
        file.writeText(content, Charsets.UTF_8)
        return file.absolutePath
    }

    private fun readViaFile(file: File): String? =
        if (file.exists()) file.readText(Charsets.UTF_8) else null

    // -----------------------------------------------------------------------
    // 用户自选的文件夹（SAF）
    // -----------------------------------------------------------------------

    private fun treeUri(context: Context): Uri? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_TREE_URI, null)
            ?.let { runCatching { Uri.parse(it) }.getOrNull() }

    /** 记住用户选的文件夹（权限由调用方 takePersistableUriPermission 持久化） */
    fun setTree(context: Context, uri: Uri) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TREE_URI, uri.toString())
            .apply()
    }

    /** 恢复默认位置（Documents/LifeLog） */
    fun clearTree(context: Context) {
        val current = treeUri(context)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_TREE_URI)
            .apply()

        if (current != null) {
            try {
                context.contentResolver.releasePersistableUriPermission(
                    current,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                )
            } catch (_: Throwable) {
                /* 没拿过权限就忽略 */
            }
        }
    }

    /** 显示成「Download/records.csv」这种人不难看的写法 */
    private fun describeTree(context: Context): String? {
        val tree = treeUri(context) ?: return null
        return try {
            val docId = DocumentsContract.getTreeDocumentId(tree)
            val folder = docId.substringAfter(':', docId).trim('/')
            if (folder.isEmpty()) "$DIR_NAME/${FILE_RECORDS}" else "$folder/$FILE_RECORDS"
        } catch (_: Throwable) {
            null
        }
    }

    /** 指定文件夹里那个文件的 Uri；不存在返回 null */
    private fun findInTree(context: Context, tree: Uri, fileName: String): Uri? {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(
            tree,
            DocumentsContract.getTreeDocumentId(tree),
        )

        context.contentResolver.query(
            children,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            ),
            null,
            null,
            null,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                if (cursor.getString(1) == fileName) {
                    return DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0))
                }
            }
        }
        return null
    }

    /** 读出用户所选文件夹里的 CSV；文件不存在返回 null（≠ 空文件） */
    fun readFromTree(context: Context, tree: Uri, fileName: String = FILE_RECORDS): String? {
        val uri = findInTree(context, tree, fileName) ?: return null
        return context.contentResolver.openInputStream(uri)?.use {
            it.readBytes().toString(Charsets.UTF_8)
        }
    }

    private fun writeToTree(context: Context, tree: Uri, fileName: String, content: String): String {
        val resolver = context.contentResolver
        val uri = findInTree(context, tree, fileName) ?: run {
            val parent = DocumentsContract.buildDocumentUriUsingTree(
                tree,
                DocumentsContract.getTreeDocumentId(tree),
            )
            DocumentsContract.createDocument(resolver, parent, MIME, fileName)
                ?: error("无法在所选文件夹里创建 $fileName")
        }

        resolver.openOutputStream(uri, "wt")?.use {
            it.write(content.toByteArray(Charsets.UTF_8))
        } ?: error("无法写入 $fileName")

        return describeTree(context) ?: fileName
    }
}
