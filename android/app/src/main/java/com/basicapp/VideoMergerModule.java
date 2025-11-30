package com.basicapp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableArray;

public class VideoMergerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "VideoMerger";

    public VideoMergerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void mergeVideos(ReadableArray inputPaths, String outputPath, Promise promise) {
        try {
            // Convert ReadableArray to String array
            String[] paths = new String[inputPaths.size()];
            for (int i = 0; i < inputPaths.size(); i++) {
                paths[i] = inputPaths.getString(i);
            }
            
            // Call the merger
            VideoMerger.merge(paths, outputPath);
            
            // Resolve promise with output path
            promise.resolve(outputPath);
        } catch (Exception e) {
            promise.reject("MERGE_ERROR", e.getMessage(), e);
        }
    }
}
