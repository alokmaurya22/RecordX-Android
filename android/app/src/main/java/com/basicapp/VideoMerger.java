package com.basicapp;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.util.Log;

import java.io.IOException;
import java.nio.ByteBuffer;

public class VideoMerger {
    private static final String TAG = "VideoMerger";
    private static final int BUFFER_SIZE = 1024 * 1024; // 1MB

    public static void merge(String[] inputPaths, String outputPath) throws IOException {
        Log.d(TAG, "Starting merge of " + inputPaths.length + " files");
        
        MediaMuxer muxer = new MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        
        int videoTrackIndex = -1;
        int audioTrackIndex = -1;
        boolean muxerStarted = false;
        long videoPresentationTimeUs = 0;
        long audioPresentationTimeUs = 0;

        for (int fileIndex = 0; fileIndex < inputPaths.length; fileIndex++) {
            String inputPath = inputPaths[fileIndex];
            Log.d(TAG, "Processing file " + (fileIndex + 1) + "/" + inputPaths.length + ": " + inputPath);
            
            MediaExtractor extractor = new MediaExtractor();
            extractor.setDataSource(inputPath);

            // Setup tracks on first file
            if (!muxerStarted) {
                for (int i = 0; i < extractor.getTrackCount(); i++) {
                    MediaFormat format = extractor.getTrackFormat(i);
                    String mime = format.getString(MediaFormat.KEY_MIME);
                    
                    if (mime.startsWith("video/")) {
                        videoTrackIndex = muxer.addTrack(format);
                        Log.d(TAG, "Added video track: " + mime);
                    } else if (mime.startsWith("audio/")) {
                        audioTrackIndex = muxer.addTrack(format);
                        Log.d(TAG, "Added audio track: " + mime);
                    }
                }
                muxer.start();
                muxerStarted = true;
                Log.d(TAG, "Muxer started");
            }

            // Copy video track
            if (videoTrackIndex >= 0) {
                videoPresentationTimeUs = copyTrack(extractor, muxer, videoTrackIndex, "video/", videoPresentationTimeUs);
            }

            // Copy audio track
            if (audioTrackIndex >= 0) {
                audioPresentationTimeUs = copyTrack(extractor, muxer, audioTrackIndex, "audio/", audioPresentationTimeUs);
            }

            extractor.release();
        }

        muxer.stop();
        muxer.release();
        Log.d(TAG, "Merge completed successfully: " + outputPath);
    }

    private static long copyTrack(MediaExtractor extractor, MediaMuxer muxer, 
                                   int muxerTrackIndex, String mimePrefix, long offsetUs) {
        // Find track
        int trackIndex = -1;
        for (int i = 0; i < extractor.getTrackCount(); i++) {
            MediaFormat format = extractor.getTrackFormat(i);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (mime.startsWith(mimePrefix)) {
                trackIndex = i;
                break;
            }
        }

        if (trackIndex < 0) {
            Log.w(TAG, "Track not found: " + mimePrefix);
            return offsetUs;
        }

        extractor.selectTrack(trackIndex);
        extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
        
        ByteBuffer buffer = ByteBuffer.allocate(BUFFER_SIZE);
        MediaCodec.BufferInfo bufferInfo = new MediaCodec.BufferInfo();
        
        long maxPresentationTimeUs = offsetUs;

        while (true) {
            int sampleSize = extractor.readSampleData(buffer, 0);
            if (sampleSize < 0) break;

            bufferInfo.offset = 0;
            bufferInfo.size = sampleSize;
            bufferInfo.presentationTimeUs = extractor.getSampleTime() + offsetUs;
            bufferInfo.flags = extractor.getSampleFlags();

            if (bufferInfo.presentationTimeUs > maxPresentationTimeUs) {
                maxPresentationTimeUs = bufferInfo.presentationTimeUs;
            }

            muxer.writeSampleData(muxerTrackIndex, buffer, bufferInfo);
            extractor.advance();
        }

        extractor.unselectTrack(trackIndex);
        
        // Return the max presentation time for this track to use as offset for next file
        return maxPresentationTimeUs;
    }
}
