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
  Sliders, 
  Eye, 
  Building2, 
  Maximize2 
} from 'lucide-react';

interface HostelExteriorCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  propertyName?: string;
  initialAspectRatio?: number;
  onCropSave: (croppedBase64: string) => void;
  onClose: () => void;
}

// Helper: load image safely
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

// Helper: rotate bounding box calculation
function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

// Helper: High-resolution Canvas cropped image generator
async function getHighResCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return imageSrc;

  const rotRad = (rotation * Math.PI) / 180;
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) return imageSrc;

  // Preserve full high resolution (up to 2560px for crystal-clear 4K / Retina display)
  const targetWidth = Math.max(300, Math.min(2560, Math.round(Math.abs(pixelCrop.width))));
  const targetHeight = Math.max(150, Math.round((targetWidth / Math.max(1, Math.abs(pixelCrop.width))) * Math.abs(pixelCrop.height)));

  croppedCanvas.width = targetWidth;
  croppedCanvas.height = targetHeight;

  croppedCtx.imageSmoothingEnabled = true;
  croppedCtx.imageSmoothingQuality = 'high';
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

  return croppedCanvas.toDataURL('image/jpeg', 0.95);
}

export default function HostelExteriorCropModal({
  isOpen,
  imageSrc,
  propertyName = 'Residence Exterior',
  initialAspectRatio = 16 / 9,
  onCropSave,
  onClose,
}: HostelExteriorCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [aspectRatio, setAspectRatio] = useState<number>(initialAspectRatio);
  const [aspectLabel, setAspectLabel] = useState<string>('16:9');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'crop' | 'preview'>('crop');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  React.useEffect(() => {
    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          const ratio = img.naturalWidth / img.naturalHeight;
          setNaturalAspect(ratio);
        }
      };
    }
  }, [imageSrc]);

  const onCropCompleteHandler = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleGeneratePreview = async () => {
    if (!croppedAreaPixels) return;
    try {
      const cropped = await getHighResCroppedImg(imageSrc, croppedAreaPixels, rotation);
      setPreviewImage(cropped);
      setPreviewTab('preview');
    } catch (e) {
      console.error('Error generating preview:', e);
    }
  };

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;
    try {
      setIsProcessing(true);
      const cropped = await getHighResCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onCropSave(cropped);
    } catch (e) {
      console.error('Error cropping image:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFitFullImage = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(0.35);
    setRotation(0);
    if (naturalAspect) {
      setAspectRatio(naturalAspect);
      setAspectLabel('Full Image');
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspectRatio(16 / 9);
    setAspectLabel('16:9');
    setPreviewTab('crop');
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-900 text-sky-300 flex items-center justify-center shadow-md">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">Crop & Frame Exterior Photo</h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full">
                  High-Fidelity Output
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Adjust the position, zoom, and frame for <strong className="text-slate-800">{propertyName}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Mode Switcher */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setPreviewTab('crop')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                previewTab === 'crop'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Adjust & Crop</span>
            </button>
            <button
              type="button"
              onClick={handleGeneratePreview}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                previewTab === 'preview'
                  ? 'bg-white text-blue-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Residence Card Preview</span>
            </button>
          </div>

          {/* Aspect Ratio Buttons */}
          {previewTab === 'crop' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Aspect:</span>
              {[
                ...(naturalAspect ? [{ label: 'Full Image', ratio: naturalAspect, desc: 'Original Full Aspect' }] : []),
                { label: '16:9', ratio: 16 / 9, desc: 'Landscape' },
                { label: '21:9', ratio: 21 / 9, desc: 'Wide Banner' },
                { label: '4:3', ratio: 4 / 3, desc: 'Standard' },
                { label: '3:2', ratio: 3 / 2, desc: 'DSLR' },
              ].map((asp) => (
                <button
                  key={asp.label}
                  type="button"
                  onClick={() => {
                    setAspectRatio(asp.ratio);
                    setAspectLabel(asp.label);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer ${
                    aspectLabel === asp.label
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {asp.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/5">
          {previewTab === 'crop' ? (
            <div className="space-y-4">
              {/* Cropper Container */}
              <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden bg-slate-950 shadow-inner border border-slate-800">
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  minZoom={0.1}
                  maxZoom={5}
                  rotation={rotation}
                  aspect={aspectRatio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onRotationChange={setRotation}
                  onCropComplete={onCropCompleteHandler}
                  showGrid={true}
                  restrictPosition={false}
                />
              </div>

              {/* Aspect Ratio Buttons for Mobile */}
              <div className="sm:hidden flex flex-wrap items-center justify-center gap-1.5 text-xs py-1">
                {[
                  ...(naturalAspect ? [{ label: 'Full Image', ratio: naturalAspect }] : []),
                  { label: '16:9', ratio: 16 / 9 },
                  { label: '21:9', ratio: 21 / 9 },
                  { label: '4:3', ratio: 4 / 3 },
                  { label: '3:2', ratio: 3 / 2 },
                ].map((asp) => (
                  <button
                    key={asp.label}
                    type="button"
                    onClick={() => {
                      setAspectRatio(asp.ratio);
                      setAspectLabel(asp.label);
                    }}
                    className={`px-3 py-1 rounded-lg font-extrabold text-xs transition-all cursor-pointer ${
                      aspectLabel === asp.label
                        ? 'bg-blue-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {asp.label}
                  </button>
                ))}
              </div>

              {/* Interactive Tooling Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-xs items-center text-xs">
                
                {/* Zoom Slider & Buttons */}
                <div className="sm:col-span-6 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <ZoomIn className="w-3.5 h-3.5 text-blue-900" />
                      <span>Zoom Level (Zoom out freely to fit full image)</span>
                    </span>
                    <span className="font-mono text-blue-900 font-extrabold">{zoom.toFixed(2)}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoom((prev) => Math.max(0.1, prev - 0.05))}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={0.1}
                      max={4}
                      step={0.02}
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-full accent-blue-900 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setZoom((prev) => Math.min(4, prev + 0.1))}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Fit Full Image & Rotate & Reset Controls */}
                <div className="sm:col-span-6 flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleFitFullImage}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-extrabold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs shadow-2xs"
                    title="Zoom out fully to view and fit complete image"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-blue-700" />
                    <span>Fit Full Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRotation((prev) => (prev + 90) % 360)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-900" />
                    <span>Rotate ({rotation}°)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs"
                    title="Reset crop and orientation"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Live Residence Mockup Card */
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="text-center space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Live Header Preview</span>
                <p className="text-xs text-slate-600">This is how your residence exterior photo will appear to students on PineVela.</p>
              </div>

              {previewImage ? (
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xl">
                  <div className="relative aspect-video sm:aspect-21/9 w-full bg-slate-900 overflow-hidden">
                    <img src={previewImage} alt="Cropped Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />
                    <div className="absolute bottom-4 left-4 text-white space-y-1">
                      <span className="px-2.5 py-0.5 bg-emerald-500/90 backdrop-blur-xs text-white text-[10px] font-black uppercase rounded-full tracking-wider">
                        ✓ Verified Property
                      </span>
                      <h4 className="text-base font-black text-white">{propertyName}</h4>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span className="font-bold flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-blue-900" />
                      Exterior Entrance Facade
                    </span>
                    <span className="text-emerald-700 font-extrabold">Ultra Sharp Quality</span>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs bg-white rounded-3xl border border-dashed">
                  Generating preview...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 flex items-center justify-between bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-all"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {previewTab === 'preview' ? (
              <button
                type="button"
                onClick={() => setPreviewTab('crop')}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl cursor-pointer transition-all"
              >
                Back to Edit
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGeneratePreview}
                className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                <span>Preview Card</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={isProcessing}
              className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Ultra-Sharp Crop...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                  <span>Apply & Set Exterior Photo</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
