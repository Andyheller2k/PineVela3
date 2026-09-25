// Ghanaian Accredited Universities and Student Email Domain Validation

export interface GhanaUniversity {
  id: string;
  name: string;
  shortName: string;
  category: 'Public' | 'Technical' | 'Private';
  primaryDomain: string;
  allowedDomains: string[];
  exampleEmail: string;
}

export const GHANA_UNIVERSITIES: GhanaUniversity[] = [
  {
    id: 'knust',
    name: 'Kwame Nkrumah University of Science and Technology',
    shortName: 'KNUST',
    category: 'Public',
    primaryDomain: 'st.knust.edu.gh',
    allowedDomains: ['st.knust.edu.gh', 'knust.edu.gh'],
    exampleEmail: 'kwame.mensah@st.knust.edu.gh'
  },
  {
    id: 'ug',
    name: 'University of Ghana (Legon)',
    shortName: 'UG (Legon)',
    category: 'Public',
    primaryDomain: 'st.ug.edu.gh',
    allowedDomains: ['st.ug.edu.gh', 'ug.edu.gh'],
    exampleEmail: 'akwasi.osei@st.ug.edu.gh'
  },
  {
    id: 'ucc',
    name: 'University of Cape Coast',
    shortName: 'UCC',
    category: 'Public',
    primaryDomain: 'stu.ucc.edu.gh',
    allowedDomains: ['stu.ucc.edu.gh', 'ucc.edu.gh'],
    exampleEmail: 'abena.boateng@stu.ucc.edu.gh'
  },
  {
    id: 'upsa',
    name: 'University of Professional Studies, Accra',
    shortName: 'UPSA',
    category: 'Public',
    primaryDomain: 'upsamail.edu.gh',
    allowedDomains: ['upsamail.edu.gh', 'upsa.edu.gh'],
    exampleEmail: 'emmanuel.kofi@upsamail.edu.gh'
  },
  {
    id: 'uew',
    name: 'University of Education, Winneba',
    shortName: 'UEW',
    category: 'Public',
    primaryDomain: 'st.uew.edu.gh',
    allowedDomains: ['st.uew.edu.gh', 'uew.edu.gh'],
    exampleEmail: 'felix.asante@st.uew.edu.gh'
  },
  {
    id: 'umat',
    name: 'University of Mines and Technology',
    shortName: 'UMaT',
    category: 'Public',
    primaryDomain: 'stu.umat.edu.gh',
    allowedDomains: ['stu.umat.edu.gh', 'umat.edu.gh'],
    exampleEmail: 'samuel.appiah@stu.umat.edu.gh'
  },
  {
    id: 'uds',
    name: 'University for Development Studies',
    shortName: 'UDS',
    category: 'Public',
    primaryDomain: 'stu.uds.edu.gh',
    allowedDomains: ['stu.uds.edu.gh', 'uds.edu.gh'],
    exampleEmail: 'haruna.issa@stu.uds.edu.gh'
  },
  {
    id: 'uhas',
    name: 'University of Health and Allied Sciences',
    shortName: 'UHAS',
    category: 'Public',
    primaryDomain: 'stu.uhas.edu.gh',
    allowedDomains: ['stu.uhas.edu.gh', 'uhas.edu.gh'],
    exampleEmail: 'grace.amoo@stu.uhas.edu.gh'
  },
  {
    id: 'uenr',
    name: 'University of Energy and Natural Resources',
    shortName: 'UENR',
    category: 'Public',
    primaryDomain: 'stu.uenr.edu.gh',
    allowedDomains: ['stu.uenr.edu.gh', 'uenr.edu.gh'],
    exampleEmail: 'kwadwo.gyasi@stu.uenr.edu.gh'
  },
  {
    id: 'gimpa',
    name: 'Ghana Institute of Management and Public Administration',
    shortName: 'GIMPA',
    category: 'Public',
    primaryDomain: 'students.gimpa.edu.gh',
    allowedDomains: ['students.gimpa.edu.gh', 'gimpa.edu.gh'],
    exampleEmail: 'adwoa.mensah@students.gimpa.edu.gh'
  },
  {
    id: 'gctu',
    name: 'Ghana Communication Technology University',
    shortName: 'GCTU',
    category: 'Public',
    primaryDomain: 'stu.gctu.edu.gh',
    allowedDomains: ['stu.gctu.edu.gh', 'gctu.edu.gh'],
    exampleEmail: 'richard.owusu@stu.gctu.edu.gh'
  },
  {
    id: 'aamusted',
    name: 'Akenten Appiah-Menka University (AAMUSTED)',
    shortName: 'AAMUSTED',
    category: 'Public',
    primaryDomain: 'stu.aamusted.edu.gh',
    allowedDomains: ['stu.aamusted.edu.gh', 'aamusted.edu.gh'],
    exampleEmail: 'kojo.antwi@stu.aamusted.edu.gh'
  },
  {
    id: 'unimac',
    name: 'UniMAC (GIJ / GIL / NAFTI)',
    shortName: 'UniMAC',
    category: 'Public',
    primaryDomain: 'stu.unimac.edu.gh',
    allowedDomains: ['stu.unimac.edu.gh', 'unimac.edu.gh', 'gij.edu.gh'],
    exampleEmail: 'yaa.serwaa@stu.unimac.edu.gh'
  },
  {
    id: 'atu',
    name: 'Accra Technical University',
    shortName: 'ATU',
    category: 'Technical',
    primaryDomain: 'stu.atu.edu.gh',
    allowedDomains: ['stu.atu.edu.gh', 'atu.edu.gh'],
    exampleEmail: 'david.quaye@stu.atu.edu.gh'
  },
  {
    id: 'kstu',
    name: 'Kumasi Technical University',
    shortName: 'KsTU',
    category: 'Technical',
    primaryDomain: 'stu.kstu.edu.gh',
    allowedDomains: ['stu.kstu.edu.gh', 'kstu.edu.gh'],
    exampleEmail: 'isaac.opoku@stu.kstu.edu.gh'
  },
  {
    id: 'ttu',
    name: 'Takoradi Technical University',
    shortName: 'TTU',
    category: 'Technical',
    primaryDomain: 'stu.ttu.edu.gh',
    allowedDomains: ['stu.ttu.edu.gh', 'ttu.edu.gh'],
    exampleEmail: 'peter.kwofie@stu.ttu.edu.gh'
  },
  {
    id: 'htu',
    name: 'Ho Technical University',
    shortName: 'HTU',
    category: 'Technical',
    primaryDomain: 'stu.htu.edu.gh',
    allowedDomains: ['stu.htu.edu.gh', 'htu.edu.gh'],
    exampleEmail: 'selorm.dzifa@stu.htu.edu.gh'
  },
  {
    id: 'ktu',
    name: 'Koforidua Technical University',
    shortName: 'KTU',
    category: 'Technical',
    primaryDomain: 'stu.ktu.edu.gh',
    allowedDomains: ['stu.ktu.edu.gh', 'ktu.edu.gh'],
    exampleEmail: 'priscilla.adjei@stu.ktu.edu.gh'
  },
  {
    id: 'cctu',
    name: 'Cape Coast Technical University',
    shortName: 'CCTU',
    category: 'Technical',
    primaryDomain: 'stu.cctu.edu.gh',
    allowedDomains: ['stu.cctu.edu.gh', 'cctu.edu.gh'],
    exampleEmail: 'nana.arthur@stu.cctu.edu.gh'
  },
  {
    id: 'stu',
    name: 'Sunyani Technical University',
    shortName: 'STU',
    category: 'Technical',
    primaryDomain: 'stu.stu.edu.gh',
    allowedDomains: ['stu.stu.edu.gh', 'stu.edu.gh'],
    exampleEmail: 'victor.boakye@stu.stu.edu.gh'
  },
  {
    id: 'tatu',
    name: 'Tamale Technical University',
    shortName: 'TaTU',
    category: 'Technical',
    primaryDomain: 'stu.tatu.edu.gh',
    allowedDomains: ['stu.tatu.edu.gh', 'tatug.edu.gh', 'tatu.edu.gh'],
    exampleEmail: 'adam.musah@stu.tatu.edu.gh'
  },
  {
    id: 'btu',
    name: 'Bolgatanga Technical University',
    shortName: 'BTU',
    category: 'Technical',
    primaryDomain: 'stu.btu.edu.gh',
    allowedDomains: ['stu.btu.edu.gh', 'btu.edu.gh'],
    exampleEmail: 'moses.anaba@stu.btu.edu.gh'
  },
  {
    id: 'wtu',
    name: 'Dr. Hilla Limann Technical University, Wa',
    shortName: 'WTU',
    category: 'Technical',
    primaryDomain: 'stu.wtu.edu.gh',
    allowedDomains: ['stu.wtu.edu.gh', 'wtu.edu.gh'],
    exampleEmail: 'rashid.sumaila@stu.wtu.edu.gh'
  },
  {
    id: 'ashesi',
    name: 'Ashesi University',
    shortName: 'Ashesi',
    category: 'Private',
    primaryDomain: 'ashesi.edu.gh',
    allowedDomains: ['ashesi.edu.gh'],
    exampleEmail: 'kofi.mensah@ashesi.edu.gh'
  },
  {
    id: 'central',
    name: 'Central University',
    shortName: 'Central Univ',
    category: 'Private',
    primaryDomain: 'stu.central.edu.gh',
    allowedDomains: ['stu.central.edu.gh', 'central.edu.gh'],
    exampleEmail: 'charles.darko@stu.central.edu.gh'
  },
  {
    id: 'vvu',
    name: 'Valley View University',
    shortName: 'VVU',
    category: 'Private',
    primaryDomain: 'stu.vvu.edu.gh',
    allowedDomains: ['stu.vvu.edu.gh', 'vvu.edu.gh'],
    exampleEmail: 'joyce.agyemang@stu.vvu.edu.gh'
  },
  {
    id: 'pentvars',
    name: 'Pentecost University',
    shortName: 'Pentecost Univ',
    category: 'Private',
    primaryDomain: 'stu.pentvars.edu.gh',
    allowedDomains: ['stu.pentvars.edu.gh', 'pentvars.edu.gh'],
    exampleEmail: 'esther.baah@stu.pentvars.edu.gh'
  },
  {
    id: 'cug',
    name: 'Catholic University of Ghana',
    shortName: 'CUG',
    category: 'Private',
    primaryDomain: 'stu.cug.edu.gh',
    allowedDomains: ['stu.cug.edu.gh', 'cug.edu.gh'],
    exampleEmail: 'joseph.frimpong@stu.cug.edu.gh'
  },
  {
    id: 'wiuc',
    name: 'Wisconsin International University College',
    shortName: 'WIUC',
    category: 'Private',
    primaryDomain: 'stu.wiuc.edu.gh',
    allowedDomains: ['stu.wiuc.edu.gh', 'wiuc.edu.gh', 'wiuc-ghana.edu.gh'],
    exampleEmail: 'mark.donkor@stu.wiuc.edu.gh'
  },
  {
    id: 'rmu',
    name: 'Regional Maritime University',
    shortName: 'RMU',
    category: 'Public',
    primaryDomain: 'stu.rmu.edu.gh',
    allowedDomains: ['stu.rmu.edu.gh', 'rmu.edu.gh'],
    exampleEmail: 'elvis.tetteh@stu.rmu.edu.gh'
  },
  {
    id: 'acity',
    name: 'Academic City University College',
    shortName: 'Academic City',
    category: 'Private',
    primaryDomain: 'acity.edu.gh',
    allowedDomains: ['acity.edu.gh'],
    exampleEmail: 'brian.kumi@acity.edu.gh'
  },
  {
    id: 'lancaster',
    name: 'Lancaster University Ghana',
    shortName: 'Lancaster GH',
    category: 'Private',
    primaryDomain: 'lancaster.edu.gh',
    allowedDomains: ['lancaster.edu.gh'],
    exampleEmail: 'student@lancaster.edu.gh'
  },
  {
    id: 'pug',
    name: 'Presbyterian University Ghana',
    shortName: 'Presby Univ',
    category: 'Private',
    primaryDomain: 'presbyuniversity.edu.gh',
    allowedDomains: ['presbyuniversity.edu.gh', 'pug.edu.gh'],
    exampleEmail: 'paula.addo@presbyuniversity.edu.gh'
  }
];

// Disallowed commercial email domains
const COMMERCIAL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 
  'icloud.com', 'aol.com', 'mail.com', 'zoho.com', 'protonmail.com', 'yandex.com'
];

/**
 * Validates that an applicant email strictly belongs to an accredited Ghanaian university.
 */
export function validateGhanaStudentEmail(email: string, selectedUniversityName?: string): {
  isValid: boolean;
  matchedUniversity?: GhanaUniversity;
  error?: string;
  domain?: string;
} {
  const cleanEmail = (email || '').toLowerCase().trim();
  
  if (!cleanEmail) {
    return { isValid: false, error: 'Student email address is required.' };
  }

  if (!cleanEmail.includes('@')) {
    return { isValid: false, error: 'Please enter a valid email address with an @ domain.' };
  }

  const parts = cleanEmail.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { isValid: false, error: 'Invalid email formatting.' };
  }

  const domain = parts[1].toLowerCase();

  // Explicit check for generic commercial emails
  if (COMMERCIAL_DOMAINS.includes(domain)) {
    return {
      isValid: false,
      domain,
      error: `Commercial email providers (@${domain}) are not permitted. You must use your official accredited Ghanaian university student email (e.g., studentname@st.knust.edu.gh, @st.ug.edu.gh, @stu.ucc.edu.gh).`
    };
  }

  // Find matching university by allowed domains
  const matched = GHANA_UNIVERSITIES.find(u => 
    u.allowedDomains.some(d => domain === d || domain.endsWith('.' + d))
  );

  if (matched) {
    // If a university was selected, check if domain aligns or is accepted
    if (selectedUniversityName) {
      const selectedObj = GHANA_UNIVERSITIES.find(u => 
        selectedUniversityName.toLowerCase().includes(u.shortName.toLowerCase()) ||
        selectedUniversityName.toLowerCase().includes(u.name.toLowerCase())
      );
      if (selectedObj && !selectedObj.allowedDomains.some(d => domain === d || domain.endsWith('.' + d))) {
        return {
          isValid: false,
          matchedUniversity: matched,
          domain,
          error: `Email domain (@${domain}) belongs to ${matched.name}, but you selected ${selectedObj.name}. Please select ${matched.name} or use your ${selectedObj.shortName} student email (e.g. ${selectedObj.exampleEmail}).`
        };
      }
    }

    return {
      isValid: true,
      matchedUniversity: matched,
      domain
    };
  }

  // General check for valid accredited Ghana education institutional domains (.edu.gh or .ac.gh)
  if (domain.endsWith('.edu.gh') || domain.endsWith('.ac.gh')) {
    return {
      isValid: true,
      domain
    };
  }

  return {
    isValid: false,
    domain,
    error: `Domain @${domain} is not recognized as an accredited Ghanaian university student email. PineVela Student Digital Market strictly requires an official Ghanaian student email (e.g., @st.knust.edu.gh, @st.ug.edu.gh, @stu.ucc.edu.gh, @upsamail.edu.gh, or any .edu.gh domain).`
  };
}
