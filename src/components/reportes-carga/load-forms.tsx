import { EvidencePicker } from "@/components/ui/evidence-picker";
import {
  createReporteCargaAction,
  redispatchReporteCargaAction,
} from "@/features/reportes-carga/actions";

// Formularios del reporte de carga: retorno en muelle y envío (redespacho).

export function CreateReporteCargaForm() {
  return (
    <form action={createReporteCargaAction} className="dx-form-grid">
      <input name="numeroDocumento" placeholder="Numero documento" />
      <input name="factura" placeholder="Factura" />
      <input name="cliente" required placeholder="Cliente *" />
      <input name="articulo" required placeholder="Articulo *" />
      <input
        name="cantidad"
        required
        type="number"
        min="1"
        step="1"
        placeholder="Cantidad *"
      />

      <select name="estadoFisicoCarga" required defaultValue="">
        <option value="" disabled>
          Estado fisico *
        </option>
        <option value="Buen estado">Buen estado</option>
        <option value="Mal estado">Mal estado</option>
      </select>

      <input name="transportista" placeholder="Transportista" />
      <input name="ruta" placeholder="Ruta" />
      <input name="placa" placeholder="Placa" />

      <textarea
        name="descripcionMaterial"
        placeholder="Descripcion material"
        className="dx-col-span-all"
      />
      <textarea
        name="motivoNoEntrega"
        required
        placeholder="Motivo de no entrega *"
      />
      <textarea
        name="observacionesRetorno"
        placeholder="Observaciones retorno"
      />

      <EvidencePicker
        name="evidenciaRecepcion"
        label="Evidencia de recepcion"
        required
      />

      <button className="dx-submit dx-col-span-all">Registrar retorno</button>
    </form>
  );
}

export function RedispatchForm({ reporteCargaId }: { reporteCargaId: string }) {
  return (
    <form action={redispatchReporteCargaAction} className="dx-form-grid">
      <input type="hidden" name="reporteCargaId" value={reporteCargaId} />
      <input required name="conductor" placeholder="Conductor *" />
      <input required name="placaSalida" placeholder="Placa salida *" />
      <textarea required name="observaciones" placeholder="Observaciones *" />

      <EvidencePicker
        name="evidenciaRedespacho"
        label="Evidencia de salida"
        required
      />

      <button className="dx-submit dx-col-span-all">Registrar envio</button>
    </form>
  );
}
