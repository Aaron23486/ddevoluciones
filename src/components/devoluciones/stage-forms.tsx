import { EvidencePicker } from "@/components/ui/evidence-picker";
import {
  confirmReceptionAction,
  createDevolucionAction,
  disposeMaterialAction,
  locateMaterialAction,
  processInventoryAction,
} from "@/features/devoluciones/actions";

// Formularios de cada etapa de una devolución. Envían a Server Actions que validan con Zod,
// comprueban el rol y llaman a la RPC correspondiente.

export function CreateDevolucionForm() {
  return (
    <form action={createDevolucionAction} className="dx-form-grid">
      <input name="factura" required placeholder="Factura" />
      <input name="articulo" required placeholder="Articulo" />
      <input
        name="cantidad"
        required
        type="number"
        min="1"
        placeholder="Cantidad"
      />

      <select
        name="clasificacion"
        aria-label="Clasificacion"
        required
        defaultValue="bueno"
      >
        <option value="bueno">Bueno</option>
        <option value="malo">Malo</option>
        <option value="mixto">Mixto</option>
      </select>

      <select name="flujo" aria-label="Flujo" required defaultValue="pesado">
        <option value="pesado">Pesado</option>
        <option value="almacen">Almacen</option>
      </select>

      <input name="transportistaNombre" required placeholder="Transportista" />
      <input
        name="transportistaCedula"
        required
        placeholder="Cedula transportista"
      />
      <input name="placaCamion" required placeholder="Placa" />

      <textarea
        name="descripcion"
        required
        placeholder="Descripcion del material"
        className="dx-col-span-all"
      />

      <EvidencePicker name="facturaEvidencia" label="Factura" required />
      <EvidencePicker
        name="materialEvidencia"
        label="Material / tarima"
        required
      />

      <button className="dx-submit dx-col-span-all">Crear devolucion</button>
    </form>
  );
}

export function ReceptionForm({ devolucionId }: { devolucionId: string }) {
  return (
    <form action={confirmReceptionAction} className="dx-form-grid">
      <input type="hidden" name="devolucionId" value={devolucionId} />
      <input
        name="cantidadRecibida"
        type="number"
        min="1"
        required
        placeholder="Cantidad recibida"
      />
      <select
        name="clasificacion"
        aria-label="Clasificacion"
        required
        defaultValue="bueno"
      >
        <option value="bueno">Bueno</option>
        <option value="malo">Malo</option>
        <option value="mixto">Mixto</option>
      </select>
      <input
        name="cantidadBueno"
        type="number"
        min="1"
        placeholder="Cantidad bueno (Mixto)"
      />
      <input
        name="cantidadMalo"
        type="number"
        min="1"
        placeholder="Cantidad malo (Mixto)"
      />
      <input name="observaciones" placeholder="Observaciones" />

      <EvidencePicker name="facturaFirmada" label="Factura firmada" required />
      <EvidencePicker name="materialBueno" label="Material bueno" />
      <EvidencePicker name="materialMalo" label="Material malo" />

      <button className="dx-submit dx-col-span-all">Confirmar recepcion</button>
    </form>
  );
}

export function InventoryForm({ devolucionId }: { devolucionId: string }) {
  return (
    <form action={processInventoryAction} className="dx-form-grid">
      <input type="hidden" name="devolucionId" value={devolucionId} />
      <input required name="palletCodigo" placeholder="Pallet / control" />
      <input name="observaciones" placeholder="Observaciones" />
      <input
        name="cantidadBueno"
        type="number"
        min="1"
        placeholder="Cantidad bueno (Mixto)"
      />
      <input
        name="cantidadMalo"
        type="number"
        min="1"
        placeholder="Cantidad malo (Mixto)"
      />

      <EvidencePicker
        name="evidencia"
        label="Evidencia de inventario"
        required
      />

      <button className="dx-submit dx-col-span-all">Procesar inventario</button>
    </form>
  );
}

export function LocationForm({ materialId }: { materialId: string }) {
  return (
    <form action={locateMaterialAction} className="dx-form-grid">
      <input type="hidden" name="materialId" value={materialId} />
      <input required name="ubicacion" placeholder="Ubicacion final" />
      <input name="observaciones" placeholder="Observaciones" />

      <EvidencePicker name="evidencia" label="Evidencia de ubicacion" />

      <button className="dx-submit dx-col-span-all">
        Cerrar material bueno
      </button>
    </form>
  );
}

export function DispositionForm({ materialId }: { materialId: string }) {
  return (
    <form action={disposeMaterialAction} className="dx-form-grid">
      <input type="hidden" name="materialId" value={materialId} />
      <input required name="decisionFinal" placeholder="Decision final" />
      <textarea
        required
        name="observaciones"
        placeholder="Observaciones de disposicion"
      />

      <EvidencePicker
        name="evidencia"
        label="Evidencia de disposicion"
        required
      />

      <button className="dx-submit danger dx-col-span-all">
        Registrar disposicion
      </button>
    </form>
  );
}
