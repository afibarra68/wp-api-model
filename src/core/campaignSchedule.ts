import type { CampaignConfigEnvio, CampaignPlanEnvio } from '../types/entities';

const MS_24H = 24 * 60 * 60 * 1000;

export interface PlanEnvioInput {
  topeDiario?: number;
  diasPlanificados?: number;
}

export function calcularPlanEnvio(
  total: number,
  opts: PlanEnvioInput,
  defaultDias: number,
): CampaignPlanEnvio {
  if (total <= 0) {
    return { topeDiario: 0, diasEstimados: 0, total: 0, mensajesUltimoDia: 0 };
  }

  let topeDiario: number;
  let diasEstimados: number;

  if (opts.topeDiario && opts.topeDiario > 0) {
    topeDiario = opts.topeDiario;
    diasEstimados = Math.ceil(total / topeDiario);
  } else if (opts.diasPlanificados && opts.diasPlanificados > 0) {
    diasEstimados = opts.diasPlanificados;
    topeDiario = Math.max(1, Math.ceil(total / diasEstimados));
  } else {
    diasEstimados = defaultDias;
    topeDiario = Math.max(1, Math.ceil(total / diasEstimados));
  }

  const mensajesUltimoDia = total - topeDiario * (diasEstimados - 1);

  return {
    topeDiario,
    diasEstimados,
    total,
    mensajesUltimoDia: mensajesUltimoDia > 0 ? mensajesUltimoDia : topeDiario,
  };
}

export function buildConfigEnvio(
  plan: CampaignPlanEnvio,
  ventanaInicio: Date | null = null,
): CampaignConfigEnvio {
  return {
    topeDiario: plan.topeDiario,
    diasEstimados: plan.diasEstimados,
    ventanaInicio,
    enviadosEnVentana: 0,
  };
}

/** Cupo restante en la ventana actual de 24 h (y si hay que reiniciar la ventana). */
export function cupoDisponibleHoy(
  config: CampaignConfigEnvio,
  now = new Date(),
): { cupo: number; resetVentana: boolean; ventanaInicio: Date } {
  const tope = config.topeDiario;
  if (tope <= 0) return { cupo: 0, resetVentana: false, ventanaInicio: now };

  const inicio = config.ventanaInicio ? new Date(config.ventanaInicio) : null;
  const ventanaExpirada = !inicio || now.getTime() - inicio.getTime() >= MS_24H;

  if (ventanaExpirada) {
    return { cupo: tope, resetVentana: true, ventanaInicio: now };
  }

  const enviados = config.enviadosEnVentana ?? 0;
  return {
    cupo: Math.max(0, tope - enviados),
    resetVentana: false,
    ventanaInicio: inicio!,
  };
}

export function msHastaProximaVentana(config: CampaignConfigEnvio, now = new Date()): number | null {
  if (!config.ventanaInicio) return null;
  const inicio = new Date(config.ventanaInicio);
  const restante = MS_24H - (now.getTime() - inicio.getTime());
  return restante > 0 ? restante : 0;
}
