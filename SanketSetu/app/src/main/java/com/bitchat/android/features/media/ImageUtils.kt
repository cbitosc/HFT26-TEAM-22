package com.bitchat.android.features.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

object ImageUtils {
    /**
     * A small JPEG preview that rides inside the media offer so the receiver sees the picture while the
     * full file is still arriving. Squeezed until it fits [maxBytes] (the wire allows up to 16 KiB).
     */
    fun makeThumbnail(path: String, maxDim: Int = 96, maxBytes: Int = 6 * 1024): ByteArray {
        return try {
            val src = loadBitmapWithExifOrientation(path) ?: return ByteArray(0)
            val scale = maxDim.toFloat() / maxOf(src.width, src.height)
            val bmp = if (scale < 1f) {
                Bitmap.createScaledBitmap(src, (src.width * scale).toInt().coerceAtLeast(1), (src.height * scale).toInt().coerceAtLeast(1), true)
            } else src
            var quality = 55
            var bytes: ByteArray
            do {
                val out = java.io.ByteArrayOutputStream()
                bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
                bytes = out.toByteArray()
                quality -= 10
            } while (bytes.size > maxBytes && quality >= 15)
            if (bytes.size <= maxBytes) bytes else ByteArray(0)
        } catch (_: Exception) {
            ByteArray(0)
        }
    }

    fun downscaleAndSaveToAppFiles(context: Context, uri: Uri, maxDim: Int = 512, quality: Int = 85): String? {
        return try {
            val resolver = context.contentResolver
            val exifRotation = resolver.openInputStream(uri)?.use { getRotationDegreesFromExif(it) } ?: 0

            // Reopen for decode as the previous stream is consumed
            val input = resolver.openInputStream(uri) ?: return null
            val original = BitmapFactory.decodeStream(input)
            input.close()
            original ?: return null

            val oriented = if (exifRotation != 0) rotateBitmap(original, exifRotation) else original

            val w = oriented.width
            val h = oriented.height
            val scale = (maxOf(w, h).toFloat() / maxDim.toFloat()).coerceAtLeast(1f)
            val newW = (w / scale).toInt().coerceAtLeast(1)
            val newH = (h / scale).toInt().coerceAtLeast(1)
            val scaled = if (scale > 1f) Bitmap.createScaledBitmap(oriented, newW, newH, true) else oriented
            val dir = File(context.filesDir, "images/outgoing").apply { mkdirs() }
            val outFile = File(dir, "img_${System.currentTimeMillis()}.jpg")
            FileOutputStream(outFile).use { fos ->
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, fos)
            }
            try { if (oriented !== original) original.recycle() } catch (_: Exception) {}
            try { if (scaled !== oriented) oriented.recycle() } catch (_: Exception) {}
            outFile.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    fun downscalePathAndSaveToAppFiles(context: Context, path: String, maxDim: Int = 512, quality: Int = 85): String? {
        return try {
            val original = BitmapFactory.decodeFile(path) ?: return null
            val exifRotation = getRotationDegreesFromExif(path)
            val oriented = if (exifRotation != 0) rotateBitmap(original, exifRotation) else original

            val w = oriented.width
            val h = oriented.height
            val scale = (maxOf(w, h).toFloat() / maxDim.toFloat()).coerceAtLeast(1f)
            val newW = (w / scale).toInt().coerceAtLeast(1)
            val newH = (h / scale).toInt().coerceAtLeast(1)
            val scaled = if (scale > 1f) Bitmap.createScaledBitmap(oriented, newW, newH, true) else oriented
            val dir = File(context.filesDir, "images/outgoing").apply { mkdirs() }
            val outFile = File(dir, "img_${System.currentTimeMillis()}.jpg")
            FileOutputStream(outFile).use { fos ->
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, fos)
            }
            try { if (oriented !== original) original.recycle() } catch (_: Exception) {}
            try { if (scaled !== oriented) oriented.recycle() } catch (_: Exception) {}
            outFile.absolutePath
        } catch (e: Exception) {
            null
        }
    }

    fun loadBitmapWithExifOrientation(path: String): Bitmap? {
        return try {
            val base = BitmapFactory.decodeFile(path) ?: return null
            val rotation = getRotationDegreesFromExif(path)
            if (rotation != 0) rotateBitmap(base, rotation) else base
        } catch (_: Exception) {
            null
        }
    }

    private fun rotateBitmap(src: Bitmap, degrees: Int): Bitmap {
        return try {
            val m = Matrix()
            m.postRotate(degrees.toFloat())
            Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true).also {
                try { src.recycle() } catch (_: Exception) {}
            }
        } catch (_: Exception) {
            src
        }
    }

    private fun getRotationDegreesFromExif(path: String): Int = try {
        val exif = ExifInterface(path)
        orientationToDegrees(exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL))
    } catch (_: Exception) { 0 }

    private fun getRotationDegreesFromExif(stream: InputStream): Int = try {
        val exif = ExifInterface(stream)
        orientationToDegrees(exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL))
    } catch (_: Exception) { 0 }

    private fun orientationToDegrees(orientation: Int): Int = when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        ExifInterface.ORIENTATION_TRANSPOSE -> 90
        ExifInterface.ORIENTATION_TRANSVERSE -> 270
        else -> 0
    }
}
