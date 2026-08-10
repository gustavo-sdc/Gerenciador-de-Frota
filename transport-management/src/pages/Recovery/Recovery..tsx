
import Input from '../../components/Input/Input';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { registerUser } from '../../lib/user';
import { AuthContext } from '../../hooks/authContext';
import React from 'react';

export default function Recovery() {
    const [data, setData] = useState({ email: '' });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
        setData({ ...data, [field]: e.target.value });
    };

    return(
        <main className="bg-blue-700 w-screen h-screen flex flex-col items-center justify-center ">
            <h1>Recuperação de senha</h1>

            <form action="" className='container'>
                <Input label="Email:" name="email" type="email" value={data.email} onChange={(e) => handleChange(e, 'data') }/>
            </form>
        </main>
    )
}