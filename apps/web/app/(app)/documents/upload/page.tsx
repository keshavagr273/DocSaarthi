'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { documentsApi } from '../../../../lib/api';
import { cn, formatFileSize } from '../../../../lib/utils';
import axios, { AxiosProgressEvent } from 'axios';

type UploadPhase = 'idle' | 'uploading' | 'confirming' | 'done' | 'error';

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [_documentId, setDocumentId] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setPhase('idle');
      setErrorMessage('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 52428800,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
  });

  const handleUpload = async () => {
    if (!file) return;

    setPhase('uploading');
    setProgress(0);
    setErrorMessage('');

    try {
      // Step 1: Initiate upload — get presigned URL
      const { data: initiateResp } = await documentsApi.initiateUpload({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });

      const { documentId: docId, versionId, uploadUrl, uploadFields } = initiateResp.data;
      setDocumentId(docId);

      // Step 2: Upload directly to MinIO using presigned POST
      const formData = new FormData();
      Object.entries(uploadFields).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      formData.append('file', file); // 'file' must be last

      await axios.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (event.total) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      });

      setProgress(100);
      setPhase('confirming');

      // Step 3: Confirm upload — triggers processing
      await documentsApi.confirmUpload(docId, versionId);

      setPhase('done');
      toast.success('Document uploaded and queued for processing!');

      // Redirect after short delay
      setTimeout(() => router.push(`/documents/${docId}`), 1500);
    } catch (err: unknown) {
      setPhase('error');
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Upload failed. Please try again.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  const reset = () => {
    setFile(null);
    setPhase('idle');
    setProgress(0);
    setErrorMessage('');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link href="/documents" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to documents
        </Link>
        <h1 className="text-2xl font-bold text-white">Upload Document</h1>
        <p className="text-white/40 text-sm mt-1">
          Upload PDFs or images of Indian documents — government notices, invoices, certificates, and more.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer',
          isDragActive
            ? 'border-brand-500 bg-brand-600/10'
            : file
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]',
        )}
      >
        <input {...getInputProps()} />

        {file ? (
          // File selected state
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <File className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-white">{file.name}</p>
              <p className="text-sm text-white/40 mt-0.5">
                {formatFileSize(file.size)} · {ALLOWED_TYPES[file.type] ?? file.type}
              </p>
            </div>
            <button
              type="button"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); reset(); }}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Remove file
            </button>
          </div>
        ) : (
          // Empty state
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-brand-600/10 border border-brand-500/20">
              <Upload className={cn('w-8 h-8 text-brand-400 transition-transform', isDragActive && 'scale-110')} />
            </div>
            <div>
              <p className="font-semibold text-white">
                {isDragActive ? 'Drop it here!' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-sm text-white/40 mt-1">
                Supports PDF, PNG, JPEG, WebP · Max 50MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File rejection errors */}
      {fileRejections.length > 0 && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            {fileRejections[0]?.errors.map((e) => (
              <p key={e.code} className="text-red-300 text-sm">{e.message}</p>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {(phase === 'uploading' || phase === 'confirming') && (
        <div className="glass p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              {phase === 'uploading' ? `Uploading... ${progress}%` : 'Queuing for processing...'}
            </span>
            <span className="text-white/30">{progress}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-white/30">
            {phase === 'uploading' ? `Uploading ${file?.name}` : 'Your document is being queued for AI processing'}
          </p>
        </div>
      )}

      {/* Success state */}
      {phase === 'done' && (
        <div className="glass p-5 border-emerald-500/30 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-emerald-300">Upload successful!</p>
            <p className="text-sm text-white/40 mt-0.5">Redirecting to your document...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-300 font-medium">Upload failed</p>
            <p className="text-red-300/70 text-sm mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleUpload}
          disabled={!file || phase === 'uploading' || phase === 'confirming' || phase === 'done'}
          className="btn-primary flex-1 py-3"
        >
          {phase === 'uploading' || phase === 'confirming' ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
          ) : phase === 'done' ? (
            <><CheckCircle2 className="w-4 h-4" />Uploaded!</>
          ) : (
            <><Upload className="w-4 h-4" />Upload Document</>
          )}
        </button>

        {(phase === 'error' || file) && phase !== 'done' && (
          <button onClick={reset} className="btn-secondary px-5">
            Reset
          </button>
        )}
      </div>

      {/* Supported formats info */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { type: 'PDF', desc: 'Scanned or native PDFs up to 100 pages' },
          { type: 'Images', desc: 'PNG, JPEG, WebP — single page documents' },
          { type: 'Hindi', desc: 'Devanagari script fully supported' },
          { type: 'Mixed', desc: 'Hindi + English bilingual documents' },
        ].map(({ type, desc }) => (
          <div key={type} className="glass-darker p-3.5">
            <p className="text-sm font-semibold text-brand-300">{type}</p>
            <p className="text-xs text-white/35 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
