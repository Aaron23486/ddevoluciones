"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function EvidencePicker({
  name,
  label,
  required = false,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  const namedInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function assignFile(next: File | undefined) {
    if (!next) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      window.alert("Formato no permitido. Usa JPG, PNG o WEBP.");
      return;
    }

    if (next.size > 5 * 1024 * 1024) {
      window.alert("La imagen supera el maximo de 5 MB.");
      return;
    }

    if (namedInput.current) {
      const transfer = new DataTransfer();
      transfer.items.add(next);
      namedInput.current.files = transfer.files;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const nextPreview = URL.createObjectURL(next);
    previewUrlRef.current = nextPreview;
    setPreview(nextPreview);
    setFile(next);
  }

  function clear() {
    if (namedInput.current) namedInput.current.value = "";
    if (uploadInput.current) uploadInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setPreview(null);
    setFile(null);
  }

  return (
    <div className="dx-evidence-picker">
      <div className="dx-evidence-heading">
        <div>
          <strong>{label}</strong>
          <small>{required ? "Obligatoria" : "Opcional"} | JPG, PNG o WEBP | max 5 MB</small>
        </div>
        {file ? (
          <button type="button" onClick={clear}>
            Quitar
          </button>
        ) : null}
      </div>

      <input
        ref={namedInput}
        className="dx-evidence-native"
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
      />

      <input
        ref={uploadInput}
        className="dx-evidence-source"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => assignFile(event.target.files?.[0])}
      />

      <input
        ref={cameraInput}
        className="dx-evidence-source"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={(event) => assignFile(event.target.files?.[0])}
      />

      <div className="dx-evidence-actions">
        <button type="button" onClick={() => cameraInput.current?.click()}>
          Tomar foto
        </button>
        <button type="button" onClick={() => uploadInput.current?.click()}>
          Subir imagen
        </button>
      </div>

      {file ? (
        <div className="dx-evidence-preview">
          {preview ? (
            <Image
              src={preview}
              alt=""
              width={42}
              height={42}
              unoptimized
            />
          ) : null}
          <div>
            <strong>{file.name}</strong>
            <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
          </div>
        </div>
      ) : (
        <p className="dx-evidence-empty">Aun no se ha seleccionado una imagen.</p>
      )}
    </div>
  );
}