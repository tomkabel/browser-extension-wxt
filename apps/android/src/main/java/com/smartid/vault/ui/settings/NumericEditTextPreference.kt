package com.smartid.vault.ui.settings

import android.content.Context
import android.util.AttributeSet
import androidx.preference.EditTextPreference

class NumericEditTextPreference : EditTextPreference {

    constructor(context: Context, attrs: AttributeSet?) : super(context, attrs)

    constructor(context: Context) : super(context)

    init {
        setOnBindEditTextListener { editText ->
            editText.inputType = android.text.InputType.TYPE_CLASS_NUMBER
        }
    }

    override fun getPersistedString(defaultReturnValue: String?): String {
        return getPersistedStringInternal(defaultReturnValue)
    }

    override fun persistString(value: String): Boolean {
        val filtered = value.filter { it.isDigit() }
        return super.persistString(filtered)
    }

    private fun getPersistedStringInternal(defaultReturnValue: String?): String {
        val prefs = sharedPreferences ?: return defaultReturnValue ?: ""
        val stored = prefs.all[key]
        return when (stored) {
            is String -> stored
            is Int -> stored.toString()
            is Long -> stored.toString()
            else -> defaultReturnValue ?: ""
        }
    }
}
