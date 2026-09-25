import React, { useState, useCallback } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import { 
  X, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Crop, 
  RefreshCw, 
  Grid, 
  Sparkles,
  ShoppingBag,
  Tag,
  Sliders,
  Eye,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface ItemImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  initialAspectRatio?: number; // default 1 (Square 1:1)
  productTitle?: string;
  productPrice?: string | number;
  productCategory?: string;
  onCropSave: (croppedBase64: string) => void;
  onClose: () => void;
}

// Helper: createImage from source
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

// Helper: rotateSize calculates bounding box after rotation
function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

// Helper: Canvas cropped image generator
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return '';

  const rotRad = (rotation * Math.PI) / 180;

  // calculate bounding box size
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);

  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) return '';

  // Resize crop output to standard crisp resolution (max 600px width for fast loading)
  const targetWidth = Math.min(600, Math.max(100, Math.abs(pixelCrop.width)));
  const targetHeight = Math.round((targetWidth / Math.max(1, Math.abs(pixelCrop.width))) * Math.abs(pixelCrop.height));

  croppedCanvas.width = targetWidth;
  croppedCanvas.height = targetHeight;

  // Clean white background for padded/zoom-out views
  croppedCtx.fillStyle = '#ffffff';
  croppedCtx.fillRect(0, 0, targetWidth, targetHeight);

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return croppedCanvas.toDataURL('image/jpeg', 0.85);
}

export default function ItemImageCropModal({
  isOpen,
  imageSrc,
  initialAspectRatio = 1,
  productTitle = 'Your Product Title',
  productPrice = '0.00',
  productCategory = 'General',
  onCropSave,
  onClose
}: ItemImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [aspect, setAspect] = useState<number>(initialAspectRatio);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'adjust' | 'preview'>('adjust');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleGeneratePreview = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    try {
      const cropped = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      setPreviewImage(cropped);
      setActiveTab('preview');
    } catch (err) {
      console.error('Failed to generate crop preview:', err);
    }
  };

  const handleSave = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    setIsProcessing(true);
    try {
      const cropped = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onCropSave(cropped);
      onClose();
    } catch (err) {
      console.error('Failed to crop image:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspect(initialAspectRatio);
    setPreviewImage(null);
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full flex flex-col shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[95vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 font-bold">
              <Crop className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Crop & Frame Item Photo</span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-extrabold rounded-md border border-blue-400/30">Vendor Tool</span>
              </h3>
              <p className="text-[11px] text-slate-300 font-medium">Position and scale your photo to fit PineVela product cards perfectly.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher for Mobile & Desktop */}
        <div className="px-6 pt-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('adjust')}
              className={`px-4 py-2 text-xs font-black rounded-t-xl transition-all flex items-center gap-1.5 border-b-2 cursor-pointer ${
                activeTab === 'adjust'
                  ? 'bg-white text-blue-600 border-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 border-transparent'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Adjust & Crop</span>
            </button>
            <button
              type="button"
              onClick={handleGeneratePreview}
              className={`px-4 py-2 text-xs font-black rounded-t-xl transition-all flex items-center gap-1.5 border-b-2 cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-blue-600 border-blue-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 border-transparent'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Live Card Preview</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer py-1"
            title="Reset crop settings"
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {/* Main Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'adjust' ? (
            <div className="space-y-5">
              {/* Cropper Container */}
              <div className="relative w-full h-72 sm:h-80 bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  minZoom={0.3}
                  maxZoom={4}
                  zoomWithScroll={true}
                  restrictPosition={false}
                  rotation={rotation}
                  aspect={aspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropCompleteHandler}
                  classes={{
                    containerClassName: 'rounded-2xl',
                    cropAreaClassName: 'border-2 border-blue-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.75)]'
                  }}
                />
              </div>

              {/* Aspect Ratio Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Grid className="w-3.5 h-3.5 text-blue-600" />
                  <span>Product Card Aspect Ratio</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAspect(1)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      aspect === 1
                        ? 'bg-blue-50 border-blue-600 text-blue-700 font-black shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-3 h-3 border-2 border-current rounded-xs shrink-0" />
                    <span>Square (1:1)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAspect(4 / 3)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      aspect === 4 / 3
                        ? 'bg-blue-50 border-blue-600 text-blue-700 font-black shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-3.5 h-2.5 border-2 border-current rounded-xs shrink-0" />
                    <span>Standard (4:3)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAspect(3 / 4)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      aspect === 3 / 4
                        ? 'bg-blue-50 border-blue-600 text-blue-700 font-black shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-3.5 border-2 border-current rounded-xs shrink-0" />
                    <span>Portrait (3:4)</span>
                  </button>
                </div>
              </div>

              {/* Sliders: Zoom & Rotation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                {/* Zoom Control */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <ZoomIn className="w-3.5 h-3.5 text-blue-600" />
                      <span>Zoom Level</span>
                    </span>
                    <span className="text-blue-600 font-mono text-[11px]">{zoom.toFixed(1)}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoom(prev => Math.max(0.3, prev - 0.1))}
                      className="p-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title="Zoom Out (Fit Full Item)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={0.3}
                      max={4}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setZoom(prev => Math.min(4, prev + 0.1))}
                      className="p-1 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rotation Control */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                      <span>Rotation Angle</span>
                    </span>
                    <span className="text-blue-600 font-mono text-[11px]">{rotation}°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRotation(prev => (prev + 90) % 360)}
                      className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer text-xs font-bold flex items-center gap-1"
                      title="Rotate 90 degrees"
                    >
                      <span>+90°</span>
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={1}
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Live Card Preview Tab */
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-blue-950 flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <p className="font-semibold leading-relaxed">
                  Below is a realistic preview of how your framed photo will look on buyer product grids on campus.
                </p>
              </div>

              {/* Sample Product Card */}
              <div className="max-w-xs mx-auto bg-white border-2 border-blue-100 rounded-3xl overflow-hidden shadow-xl space-y-3 p-3">
                <div className="relative aspect-square bg-slate-900/5 rounded-2xl overflow-hidden border border-slate-100 flex items-center justify-center p-1">
                  {previewImage ? (
                    <img src={previewImage} alt="Cropped Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                      <ShoppingBag className="w-8 h-8 mb-1" />
                      <span>Generating card preview...</span>
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 px-2.5 py-1 bg-slate-900/80 backdrop-blur-md text-white font-black text-[10px] rounded-lg tracking-wider">
                    {productCategory}
                  </span>
                </div>

                <div className="space-y-2 p-1">
                  <h4 className="text-xs font-black text-slate-900 line-clamp-1">{productTitle || 'Your Item Title'}</h4>
                  
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400">GH₵</span>
                      <span className="text-base font-black text-blue-600">
                        {parseFloat(String(productPrice) || '0').toFixed(2)}
                      </span>
                    </div>

                    <div className="px-3 py-1.5 bg-blue-600 text-white font-extrabold text-[10px] rounded-xl shadow-xs">
                      Buy Now
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {activeTab === 'adjust' && (
              <button
                type="button"
                onClick={handleGeneratePreview}
                className="px-4 py-2.5 bg-sky-100 hover:bg-sky-200 text-blue-900 font-extrabold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Card</span>
              </button>
            )}

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSave}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <span>Processing Crop...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Apply & Save Photo</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
