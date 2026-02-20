import dlib

print("Checking dlib GPU Support...")
if dlib.DLIB_USE_CUDA:
    print("✅ SUCCESS: dlib is compiled with CUDA support!")
    print(f"✅ Active GPU Devices: {dlib.cuda.get_num_devices()}")
else:
    print("❌ FAILURE: dlib is NOT using CUDA (GPU). It is using the CPU.")