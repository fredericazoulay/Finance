import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface WorkGroup {
  code: string;
  typeKey: string;
  detailKey?: string;
}

const GROUP_CODES = [
  'BO', 'BO_ANALYSE', 'BO_CASH', 'BO_COMPTA', 'BO_EOD', 'BO_EXT', 'BO_EXTOTPL', 'BO_EXTPEPL', 'BO_EXTEPEL',
  'BO_EXTVMPL', 'BO_EXT_OTC', 'BO_EXT_PE', 'BO_EXT_VMO', 'BO_MANAGER', 'BO_OPS', 'BO_OPS_FLX', 'BO_OTC',
  'BO_OTC_APP', 'BO_OTC_SUP', 'BO_SEC', 'BO_SPE', 'BO_STL', 'BO_SUP', 'BO_TPO_IMP', 'BO_TPO_OST', 'BO_VALO',
  'BO_VMOB', 'BO_VMOB_AP', 'BO_VMOB_SU', 'COLLATERAL', 'CONFIG', 'CONTRL-INT', 'CONTROL', 'DEOFIP', 'DFFE',
  'DFFE_GES', 'DFFE_ST', 'DFI', 'DFINB2', 'DFINB3', 'DFINF', 'DFINF_ST', 'DPFGPA-DR', 'DPFGPA-WI',
  'DPFGPTAUX', 'DPFIDS-DR', 'DPFIDS-WI', 'FO', 'FO FI', 'FO_AM', 'FO_COM', 'FO_CRD', 'FO_EOD', 'FO_EQD',
  'FO_EXT', 'FO_FI', 'FO_FXD_SA', 'FO_FXD_TR', 'FO_FXMM_SA', 'FO_FXMM_TR', 'FO_FX_FWD', 'FO_FX_SPT',
  'FO_IRD', 'FO_MM', 'FO_MM_TR', 'FO_OAT', 'FO_PERF', 'FO_PL_CTRL', 'FO_SALES', 'FO_SF', 'FRR', 'GDAFCT',
  'GDAPT', 'GDAPTC', 'GDAPTH', 'GDAPTS', 'GDAPTT', 'HOUSEKEEP', 'INTERMED', 'LICADMIN', 'MIG_MO', 'MLC_ADMIN',
  'MLC_CONFIG', 'MLC_EU', 'MLC_OPS', 'MLC_SUP', 'MLC_SUPP', 'MO', 'MO-ACPR', 'MO-ANALYSE', 'MO-BCH_CPL',
  'MO-CLT_EXT', 'MO-DPFSM2', 'MO-EQ_NC', 'MO-OST_INS', 'MO-SUPGEST', 'MO2', 'MOASUPP_BO', 'MOASUPP_FO',
  'MOASUPP_MO', 'MOA_CONFIG'
] as const;

const GROUP_METADATA: Record<string, Omit<WorkGroup, 'code'>> = {
  BO: { typeKey: 'group_type_processing' },
  BO_ANALYSE: { typeKey: 'group_type_fo', detailKey: 'group_detail_fod1' },
  BO_CASH: { typeKey: 'group_type_processing' },
  BO_COMPTA: { typeKey: 'group_type_processing', detailKey: 'group_detail_configurator' },
  BO_EOD: { typeKey: 'group_type_processing' },
  BO_EXT: { typeKey: 'group_type_processing' },
  BO_EXTOTPL: { typeKey: 'group_type_pl' },
  BO_EXTPEPL: { typeKey: 'group_type_pl' },
  BO_EXTEPEL: { typeKey: 'group_type_pl' },
  BO_EXTVMPL: { typeKey: 'group_type_pl' },
  BO_EXT_OTC: { typeKey: 'group_type_processing' },
  BO_EXT_PE: { typeKey: 'group_type_processing' },
  BO_EXT_VMO: { typeKey: 'group_type_processing' },
  BO_MANAGER: { typeKey: 'group_type_operations' },
  BO_OPS: { typeKey: 'group_type_operations' },
  BO_OPS_FLX: { typeKey: 'group_type_operations' }
};

export const WORK_GROUPS: WorkGroup[] = GROUP_CODES.map(code => ({
  code,
  ...(GROUP_METADATA[code] ?? { typeKey: 'group_type_murex' })
}));

const DEFAULT_GROUP = 'CONFIG';
const SELECTED_GROUP_STORAGE_KEY = 'murexSelectedGroup';

@Injectable({ providedIn: 'root' })
export class WorkGroupService {
  readonly groups = WORK_GROUPS;
  private readonly selectedGroupSubject = new BehaviorSubject(this.restoreSelectedGroup());
  readonly selectedGroup$ = this.selectedGroupSubject.asObservable();

  get selectedGroup(): string {
    return this.selectedGroupSubject.value;
  }

  setSelectedGroup(code: string): void {
    if (!this.groups.some(group => group.code === code)) return;
    this.selectedGroupSubject.next(code);
    try {
      localStorage.setItem(SELECTED_GROUP_STORAGE_KEY, code);
    } catch (error) {
      console.debug('[WorkGroupService] error persisting selected group', error);
    }
  }

  private restoreSelectedGroup(): string {
    try {
      const storedGroup = localStorage.getItem(SELECTED_GROUP_STORAGE_KEY);
      if (storedGroup && this.groups.some(group => group.code === storedGroup)) return storedGroup;
    } catch (error) {
      console.debug('[WorkGroupService] error restoring selected group', error);
    }
    return DEFAULT_GROUP;
  }
}