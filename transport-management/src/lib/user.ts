import supabase from "../supabase/supabase"
import { registerTenant } from "./tenant"

interface NewUser {
    email: string,
    password: string,
}

interface MetaData {
    cnpj?: string,
    nome_empresa?: string,
    nome_usuario?: string
}

export const registerUser = async (params: { user?: NewUser; metaData?: MetaData }) => {
    const { user, metaData } = params

    console.log("🚀 ~ registerUser ~ user:", user)

    if (!user) {
        throw new Error("User information is required for registration.");
    }
    
    const {data: newUser, error} = await supabase.auth.signUp({
        email: user.email,
        password: user.password
    })
    
    console.log("🚀 ~ registerUser ~ newUser:", newUser)


    if(error){
        console.log("🚀 ~ registerUser ~ error:", error)
    }

    if(newUser){
        const newTenant = await registerTenant({cnpj: metaData?.cnpj})
        console.log("🚀 ~ registerUser ~ newTenant:", newTenant)

        return newTenant
    }

    return newUser
}

export const login = async (user: NewUser) =>{
    console.log("🚀 ~ login ~ user:", user)

    const {data: loggedUser, error} = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password
    })

    console.log("🚀 ~ login ~ loggedUser:", loggedUser)

    

    if(error){
        throw new Error(error.message)
    }

    return loggedUser
}

export const signOut = async()=>{
    const { error} = await supabase.auth.signOut()

    if (error){
        throw new Error('Erro ao deslogar')
    } else{
        return true
    }

}