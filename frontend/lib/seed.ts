import { Product, CompanyInfo, Branch } from './types';

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'costarica',
    slug: 'costarica',
    name: 'KYG DISTRIBUCIONES CR',
    country: 'Costa Rica',
    orderPrefix: 'CR',
    currencySymbol: '₡',
    currencyCode: 'CRC',
    phone: '+506 7032 1935',
    address: 'San José, Costa Rica',
    slogan: 'PELUCHES CON ALMA',
    socialMedia: 'https://www.facebook.com/share/166ApzX8wK7/',
    logoUrl: '/assets/Logo.png',
    isActive: true,
    isMain: true,
    showStock: false,
  },
];


export const INITIAL_TENANTS: Branch[] = INITIAL_BRANCHES;

export const INITIAL_COMPANY_INFO: CompanyInfo = {
  tenantId: 'costarica',
  name: 'KYG DISTRIBUCIONES CR',
  slogan: 'PELUCHES CON ALMA',
  phone: '+506 7032 1935',
  address: 'San José, Costa Rica',
  socialMedia: 'https://www.facebook.com/share/166ApzX8wK7/',
  logoUrl: '/assets/Logo.png',
  nameLogoUrl: '/assets/Nombre.png',
  currencySymbol: '₡',
  currencyCode: 'CRC',
  showStock: false,
  brandColors: {
    primary: '#3C5866',
    accent: '#C37D41',
    pastels: ['#B9E0FD'],
  },
};

export const INITIAL_PRODUCTS: Product[] = [];

