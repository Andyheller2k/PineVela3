import { activateOnKeyboard } from '../lib/keyboardActivation';
import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Crop, 
  Sparkles,
  Sliders,
  ShieldCheck,
  Maximize2
} from 'lucide-react';
import HostelExteriorCropModal from './HostelExteriorCropModal';

interface HostelImageUploaderProps {
  currentImageUrl: string;
  imagePreviewUrl?: string;
  galleryUrls?: string[];
  propertyName?: string;
  onImageSelected: (payload: { file: File | null; previewUrl: string; base64Data: string; fileName: string; fileType: string }) => void;
  onImageRemoved: () => void;
  onGalleryUpdated?: (urls: string[]) => void;
}

export default function HostelImageUploader({
  currentImageUrl,
  imagePreviewUrl,
  galleryUrls = [],
  propertyName = 'Residence',
  onImageSelected,
  onImageRemoved,
  onGalleryUpdated
}: HostelImageUploaderProps) {
  const exteriorInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingExterior, setIsDraggingExterior] = useState(false);
  const [isDraggingGallery, setIsDraggingGallery] = useState(false);
  const [exteriorFileDetails, setExteriorFileDetails] = useState<{ name: string; size: string; dimensions?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // High-Resolution Cropping States
  const [rawExteriorImage, setRawExteriorImage] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);

  const displayExterior = imagePreviewUrl || currentImageUrl;
  const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB Maximum Limit

  const processExteriorFile = (file: File) => {
    setErrorMsg(null);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Please upload a valid image format (JPEG, PNG, or WebP) for the exterior photo.');
      return;
    }

    // Require photo size to be 2MB or less
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setErrorMsg(`Photo "${file.name}" is ${sizeMb} MB. PineVela requires photographs to be 2MB or less (< 2MB).`);
      return;
    }

    // Read full high-resolution raw image without downscaling
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setRawExteriorImage(base64);
      setPendingFile(file);
      setExteriorFileDetails({
        name: file.name,
        size: `${sizeMb} MB (Original High-Res)`,
        dimensions: 'Uncompressed High-Res'
      });

      // Automatically open the crop and frame tool so manager can adjust it well
      setIsCropModalOpen(true);
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read high-resolution image file. Please try another image.');
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = (croppedBase64: string) => {
    setIsCropModalOpen(false);
    onImageSelected({
      file: pendingFile,
      previewUrl: croppedBase64,
      base64Data: croppedBase64,
      fileName: pendingFile?.name || 'exterior_cropped.jpg',
      fileType: 'image/jpeg'
    });
  };

  const processGalleryFiles = async (files: FileList | File[]) => {
    setErrorMsg(null);
    const fileArray = Array.from(files);
    const currentCount = galleryUrls.length;
    const availableSlots = 3 - currentCount;

    if (availableSlots <= 0) {
      setErrorMsg('Maximum of 3 interior/relevant photos allowed.');
      return;
    }

    const toProcess = fileArray.slice(0, availableSlots);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    // Enforce maximum 2MB on gallery images
    const oversizedFiles = toProcess.filter(f => f.size > MAX_SIZE_BYTES);
    if (oversizedFiles.length > 0) {
      const names = oversizedFiles.map(f => `"${f.name}" (${(f.size / (1024 * 1024)).toFixed(2)} MB)`).join(', ');
      setErrorMsg(`The following image(s) exceed the 2MB limit: ${names}. All photos must be 2MB or less (< 2MB).`);
      return;
    }

    const newUrls: string[] = [];

    for (const file of toProcess) {
      if (!validTypes.includes(file.type)) continue;
      // Read at full raw resolution without low-res downscaling
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          if (reader.result) newUrls.push(reader.result as string);
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      });
    }

    if (newUrls.length > 0 && onGalleryUpdated) {
      onGalleryUpdated([...galleryUrls, ...newUrls]);
    }
  };

  const handleRemoveGalleryItem = (indexToRemove: number) => {
    if (onGalleryUpdated) {
      const updated = galleryUrls.filter((_, idx) => idx !== indexToRemove);
      onGalleryUpdated(updated);
    }
  };

  return (
    <div className="space-y-6 text-left">
      {/* SECTION 1: MANDATORY EXTERIOR PHOTO */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            1. Building Photograph
            <span className="text-rose-600 font-black">*</span>
          </label>
          {displayExterior ? (
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 size={12} /> Exterior Photo Uploaded
            </span>
          ) : (
            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-md border border-rose-200 flex items-center gap-1">
              <AlertCircle size={12} /> Required: upload a building photograph
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Upload an authentic, clear photograph of your building's exterior facade or entrance. Maximum <strong>2MB</strong> per photo.
        </p>

        <input
          ref={exteriorInputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              processExteriorFile(e.target.files[0]);
            }
          }}
          className="hidden"
        />

        {displayExterior ? (
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <div className="relative aspect-video sm:aspect-21/9 max-h-72 w-full bg-slate-900 overflow-hidden group">
              <img
                src={displayExterior}
                alt="Exterior Residence"
                className="w-full h-full object-cover group-hover:scale-101 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />



              {/* Bottom Action Controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCropModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Crop and frame exterior image"
                >
                  <Crop size={14} className="text-sky-300" />
                  <span>Crop & Adjust Frame</span>
                </button>

                <button
                  type="button"
                  onClick={() => exteriorInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-white/95 hover:bg-white text-slate-800 text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  Replace Photo
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setExteriorFileDetails(null);
                    setRawExteriorImage(null);
                    setPendingFile(null);
                    onImageRemoved();
                  }}
                  className="p-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                  title="Remove exterior photo"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {exteriorFileDetails && (
                <div className="absolute bottom-4 left-4 text-white text-xs space-y-0.5">
                  <p className="font-bold truncate max-w-xs">{exteriorFileDetails.name}</p>
                  <p className="text-slate-300 text-[11px] font-mono">
                    {exteriorFileDetails.dimensions} • {exteriorFileDetails.size}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div role="button" tabIndex={0} aria-label="Choose residence exterior photograph" onKeyDown={activateOnKeyboard}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingExterior(true); }}
            onDragLeave={() => setIsDraggingExterior(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingExterior(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                processExteriorFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => exteriorInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all ${
              isDraggingExterior
                ? 'border-blue-600 bg-blue-50/60 scale-[1.01]'
                : 'border-slate-300 bg-slate-50/70 hover:bg-slate-100/70 hover:border-blue-400'
            }`}
          >
            <div className="max-w-md mx-auto space-y-2.5">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center shadow-xs">
                <UploadCloud size={28} />
              </div>
              <h4 className="text-sm font-extrabold text-slate-900">
                Click or drag & drop exterior photo
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                JPEG, PNG, WebP — <strong>Max 2MB per photo</strong>. Includes built-in cropping tool to frame the entrance.
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-full text-[11px] font-bold">
                <Crop size={12} />
                <span>Auto-opens Cropping & Framing tool on upload</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: MANDATORY 1 TO 3 INTERIOR / RELEVANT PHOTOS */}
      <div className="space-y-2 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            2. Compulsory Interior & Relevant Photos (1 to 3 Photos)
            <span className="text-rose-600 font-black">*</span>
          </label>
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border self-start sm:self-auto ${
            galleryUrls.length >= 1
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-amber-800 bg-amber-50 border-amber-300'
          }`}>
            {galleryUrls.length}/3 Photos Uploaded {galleryUrls.length >= 1 ? '(Ready)' : `(Need ${1 - galleryUrls.length} more)`}
          </span>
        </div>


        <input
          ref={galleryInputRef}
          type="file"
          multiple
          accept="image/png, image/jpeg, image/webp"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              processGalleryFiles(e.target.files);
            }
          }}
          className="hidden"
        />

        {/* Gallery Preview Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
          {galleryUrls.map((url, idx) => (
            <div key={idx} className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-xs">
              <img
                src={url}
                alt={`Residence Interior ${idx + 1}`}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-xs">
                Photo #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveGalleryItem(idx)}
                className="absolute top-1.5 right-1.5 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-transform cursor-pointer"
                title="Remove photo"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {galleryUrls.length < 3 && (
            <div role="button" tabIndex={0} aria-label="Add residence gallery photograph" onKeyDown={activateOnKeyboard}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingGallery(true); }}
              onDragLeave={() => setIsDraggingGallery(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingGallery(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  processGalleryFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => galleryInputRef.current?.click()}
              className={`aspect-4/3 rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-3 text-center cursor-pointer transition-all ${
                isDraggingGallery
                  ? 'border-blue-600 bg-blue-50/60'
                  : 'border-slate-300 bg-slate-50/60 hover:bg-blue-50/40 hover:border-blue-400'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center mb-1">
                <Plus size={18} />
              </div>
              <span className="text-[11px] font-bold text-slate-700">Add Photo</span>
              <span className="text-[9px] text-slate-400">({3 - galleryUrls.length} remaining • Max 2MB)</span>
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* High Resolution Exterior Crop Modal */}
      {isCropModalOpen && (rawExteriorImage || displayExterior) && (
        <HostelExteriorCropModal
          isOpen={isCropModalOpen}
          imageSrc={rawExteriorImage || displayExterior}
          propertyName={propertyName}
          initialAspectRatio={16 / 9}
          onCropSave={handleCropSave}
          onClose={() => setIsCropModalOpen(false)}
        />
      )}
    </div>
  );
}
