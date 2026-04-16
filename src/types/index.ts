import { Request } from "express";

export interface AuthUser {
  email: string;
  groups: string[];
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface EventDate {
  id?: number;
  eventoId?: number;
  data: string;
  ora?: string | null;
}

export interface Evento {
  id?: number;
  publicId: string;
  titolo: string;
  immagineS3Path?: string | null;
  descrizioneIT?: string | null;
  descrizioneEN?: string | null;
  linkBiglietti?: string | null;
  dates?: EventDate[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Press {
  id?: number;
  publicId: string;
  nomeTestata: string;
  citazioneIT?: string | null;
  citazioneEN?: string | null;
  nomeGiornalista?: string | null;
  ordine?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlbumFotografico {
  id?: number;
  publicId: string;
  nome: string;
  ordine?: number;
  immagini?: Immagine[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Immagine {
  id?: number;
  publicId: string;
  albumId?: number;
  ordine: number;
  s3Path?: string | null;
  titolo?: string | null;
  ruoloIT?: string | null;
  ruoloEN?: string | null;
  conIT?: string | null;
  conEN?: string | null;
  descrizioneIT?: string | null;
  descrizioneEN?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlbumMusicale {
  id?: number;
  publicId: string;
  titolo: string;
  fotoS3Path?: string | null;
  streamingLinks?: Record<string, string> | null;
  audioPreviewS3Path?: string | null;
  ordine?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
