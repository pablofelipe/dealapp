import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Função para verificar se o lojista já tem perfil cadastrado
export async function checkMerchantProfile(uid) {
    const docRef = doc(db, "merchants", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
}

// Máscara profissional para CNPJ
export function maskCNPJ(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 14) value = value.slice(0, 14);
    value = value.replace(/^(\d{2})(\d)/, "$1.$2");
    value = value.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    value = value.replace(/\.(\d{3})(\d)/, ".$1/$2");
    value = value.replace(/(\d{4})(\d)/, "$1-$2");
    input.value = value;
}

// Salva o perfil e vincula a localização fixa
export async function saveMerchantProfile(uid, profileData) {
    try {
        await setDoc(doc(db, "merchants", uid), {
            ...profileData,
            updatedAt: new Date()
        });
        return true;
    } catch (error) {
        console.error("Erro ao salvar perfil:", error);
        return false;
    }
}

// Esta função pega os campos de texto e transforma em coordenadas GPS
export async function geocodeAddress(address, neighborhood, cityState) {
    // Concatenamos para garantir que a busca seja em São Paulo
    const fullQuery = `${address}, ${neighborhood}, ${cityState}, Brasil`;

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullQuery)}`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            // Retornamos um objeto formatado com números reais
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon),
                fullAddress: data[0].display_name
            };
        }
        throw new Error("Endereço não localizado. Verifique os dados.");
    } catch (error) {
        console.error("Erro na geocodificação:", error);
        return null;
    }
}